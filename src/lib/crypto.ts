/**
 * Field-level encryption for sensitive data (ID numbers, loyalty numbers, policy numbers).
 *
 *  SAME PIN → SAME KEY ON EVERY DEVICE
 *  ------------------------------------
 *  The master AES-GCM-256 key is derived from the user's PIN with PBKDF2 (310k iterations)
 *  using a *fixed, app-wide* salt. Because nothing device-specific goes into the derivation,
 *  entering the same PIN on any device yields exactly the same key — so ciphertext synced
 *  through Firestore decrypts everywhere with no key-merge step.
 *
 *  - The key only ever lives in memory while the app is unlocked; only a verifier is persisted.
 *  - Ciphertext is stored as "enc1.<iv>.<ct>" (base64).
 *  - Biometric unlock (WebAuthn platform authenticator): the master key is wrapped with a
 *    non-extractable device key stored in IndexedDB, and is only unwrapped after a successful
 *    WebAuthn assertion.
 *
 *  LEGACY DATA
 *  -----------
 *  Earlier versions generated a *random* salt per device, so every device ended up with its own
 *  key. Those old salts are remembered (`legacySalts`, locally and in the cloud vault doc). When
 *  the user unlocks with their PIN we derive the old keys too, use them as read fallbacks and
 *  silently re-encrypt everything with the shared key. Salts are public by design; nothing
 *  secret is ever stored or synced.
 */
import { db, getSetting, setSetting } from "./db";

const ITERATIONS = 310_000;
const PREFIX = "enc1.";
const VERIFIER_PLAINTEXT = "passport-ok";

/**
 * Fixed application salt (v2 key scheme). 16 bytes, never changes.
 * Using a constant means PBKDF2(PIN) is identical on every device.
 */
const APP_SALT = new Uint8Array([0x50, 0x61, 0x63, 0x6b, 0x52, 0x61, 0x74, 0x56, 0x61, 0x75, 0x6c, 0x74, 0x4b, 0x65, 0x79, 0x32]); // "PackRatVaultKey2"

export interface LockConfig {
  saltB64: string;
  verifierB64: string; // encrypt("passport-ok")
  iterations: number;
  autoLockMinutes: number;
  /** When this verifier was created. */
  keyCreatedAt?: number;
  /** Salts from the old per-device scheme whose data may still be around (public, non-secret). */
  legacySalts?: string[];
  biometric?: { credentialIdB64: string; wrappedKeyB64: string; ivB64: string };
}

/**
 * What is shared in the cloud so a freshly installed device can check the PIN before it
 * starts encrypting. Contains NO secret material: the salt is public and the verifier is just
 * AES-GCM("passport-ok").
 */
export interface VaultKeyConfig {
  saltB64: string;
  verifierB64: string;
  iterations: number;
  keyCreatedAt: number;
  legacySalts?: string[];
}

const enc = new TextEncoder();
const dec = new TextDecoder();
const b64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const rnd = (n: number) => crypto.getRandomValues(new Uint8Array(n));

export const APP_SALT_B64 = b64(APP_SALT);
/** Is this config using the shared (deterministic) key scheme? */
export const isSharedScheme = (cfg?: { saltB64: string; iterations: number } | null) => !!cfg && cfg.saltB64 === APP_SALT_B64 && cfg.iterations === ITERATIONS;

export const vaultKeyOf = (cfg: LockConfig): VaultKeyConfig => ({ saltB64: cfg.saltB64, verifierB64: cfg.verifierB64, iterations: cfg.iterations, keyCreatedAt: cfg.keyCreatedAt ?? 0, legacySalts: cfg.legacySalts ?? [] });

/** Union of every legacy salt we know about (local + remote), excluding the shared app salt. */
export function collectLegacySalts(...sources: (LockConfig | VaultKeyConfig | null | undefined)[]): string[] {
  const out = new Set<string>();
  for (const s of sources) {
    if (!s) continue;
    if (s.saltB64 && s.saltB64 !== APP_SALT_B64) out.add(s.saltB64);
    for (const l of s.legacySalts ?? []) if (l && l !== APP_SALT_B64) out.add(l);
  }
  return [...out];
}

export async function getLockConfig() {
  return getSetting<LockConfig | null>("lock", null);
}

async function deriveKey(pin: string, salt: Uint8Array, iterations: number) {
  const base = await crypto.subtle.importKey("raw", enc.encode(pin), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
}

/** The shared vault key: depends on the PIN only. */
export const deriveVaultKey = (pin: string) => deriveKey(pin, APP_SALT, ITERATIONS);

/** Keys for the old per-device scheme (used only as read fallbacks during migration). */
export async function deriveLegacyKeys(pin: string, salts: string[]): Promise<CryptoKey[]> {
  const keys: CryptoKey[] = [];
  for (const s of salts) {
    try {
      keys.push(await deriveKey(pin, unb64(s), ITERATIONS));
    } catch {
      /* malformed salt — ignore */
    }
  }
  return keys;
}

export async function encryptString(key: CryptoKey, plain: string): Promise<string> {
  if (!plain) return "";
  const iv = rnd(12);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, enc.encode(plain));
  return `${PREFIX}${b64(iv)}.${b64(ct)}`;
}

export const isEncrypted = (s?: string) => !!s && s.startsWith(PREFIX);

export async function decryptString(key: CryptoKey, value: string): Promise<string> {
  if (!value) return "";
  if (!isEncrypted(value)) return value; // legacy / plaintext fallback
  const [, ivB64, ctB64] = value.split(".");
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(ivB64) as BufferSource }, key, unb64(ctB64) as BufferSource);
  return dec.decode(pt);
}

/** Try the primary key first, then any fallback keys. Throws if none can read the value. */
export async function decryptWithAny(keys: CryptoKey[], value: string): Promise<string> {
  if (!value || !isEncrypted(value)) return value ?? "";
  let lastErr: unknown = new Error("No key");
  for (const k of keys) {
    try {
      return await decryptString(k, value);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

async function verifierMatches(key: CryptoKey, verifierB64: string) {
  try {
    return (await decryptString(key, verifierB64)) === VERIFIER_PLAINTEXT;
  } catch {
    return false;
  }
}

/** Derive the key for `pin` using whatever scheme `cfg` describes and check it against `cfg`'s verifier. */
export async function verifyPinAgainst(pin: string, cfg: VaultKeyConfig | LockConfig): Promise<CryptoKey | null> {
  const key = isSharedScheme(cfg) ? await deriveVaultKey(pin) : await deriveKey(pin, unb64(cfg.saltB64), cfg.iterations);
  return (await verifierMatches(key, cfg.verifierB64)) ? key : null;
}

async function writeSharedConfig(key: CryptoKey, opts: { autoLockMinutes?: number; legacySalts?: string[]; keepBiometric?: LockConfig["biometric"] } = {}): Promise<LockConfig> {
  const prev = await getLockConfig();
  const cfg: LockConfig = {
    saltB64: APP_SALT_B64,
    verifierB64: await encryptString(key, VERIFIER_PLAINTEXT),
    iterations: ITERATIONS,
    autoLockMinutes: opts.autoLockMinutes ?? prev?.autoLockMinutes ?? 5,
    keyCreatedAt: Date.now(),
    legacySalts: collectLegacySalts(prev, { saltB64: APP_SALT_B64, verifierB64: "", iterations: ITERATIONS, keyCreatedAt: 0, legacySalts: opts.legacySalts }),
    biometric: opts.keepBiometric,
  };
  await setSetting("lock", cfg);
  return cfg;
}

/** First run: create the shared key from the PIN. */
export async function setupPin(pin: string, autoLockMinutes = 5, legacySalts: string[] = []): Promise<CryptoKey> {
  const key = await deriveVaultKey(pin);
  await writeSharedConfig(key, { autoLockMinutes, legacySalts });
  await db.settings.delete("deviceKey");
  return key;
}

/**
 * First run on a device that is already signed in: check the PIN against the verifier the other
 * devices published, then set up the same shared key here. Returns null if the PIN is wrong.
 */
export async function setupPinFromRemote(pin: string, remote: VaultKeyConfig, autoLockMinutes = 5): Promise<CryptoKey | null> {
  const ok = await verifyPinAgainst(pin, remote);
  if (!ok) return null;
  return setupPin(pin, autoLockMinutes, collectLegacySalts(remote));
}

/** Can `key` decrypt this ciphertext? (plaintext / empty counts as readable) */
export async function canDecrypt(key: CryptoKey, value?: string): Promise<boolean> {
  if (!value || !isEncrypted(value)) return true;
  try {
    await decryptString(key, value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Re-encrypt every sensitive field so that it is readable with `newKey`.
 * Fields already readable with `newKey` are left untouched; fields readable with one of
 * `oldKeys` are re-encrypted; anything else is left as-is and counted as unreadable.
 */
export async function reencryptAll(oldKeys: CryptoKey[], newKey: CryptoKey, enqueue = true): Promise<{ rewritten: number; unreadable: number }> {
  let rewritten = 0;
  let unreadable = 0;
  const re = async (v?: string): Promise<string | undefined | null> => {
    if (!v || !isEncrypted(v)) return null;
    if (await canDecrypt(newKey, v)) return null; // already fine
    for (const k of oldKeys) {
      if (await canDecrypt(k, v)) return encryptString(newKey, await decryptString(k, v));
    }
    unreadable++;
    return null;
  };
  await db.transaction("rw", db.documents, db.loyalty, db.trips, db.syncQueue, async () => {
    for (const d of await db.documents.toArray()) {
      const v = await re(d.numberEnc);
      if (v != null) {
        rewritten++;
        await db.documents.update(d.id, { numberEnc: v, updatedAt: Date.now() });
        if (enqueue) await db.syncQueue.add({ table: "documents", docId: d.id, op: "put", at: Date.now(), label: `Document · ${d.label ?? d.type}` });
      }
    }
    for (const l of await db.loyalty.toArray()) {
      const v = await re(l.numberEnc);
      if (v != null) {
        rewritten++;
        await db.loyalty.update(l.id, { numberEnc: v, updatedAt: Date.now() });
        if (enqueue) await db.syncQueue.add({ table: "loyalty", docId: l.id, op: "put", at: Date.now(), label: `Loyalty · ${l.program}` });
      }
    }
    for (const t of await db.trips.toArray()) {
      if (!t.emergency?.insurancePolicyEnc) continue;
      const v = await re(t.emergency.insurancePolicyEnc);
      if (v != null) {
        rewritten++;
        await db.trips.update(t.id, { emergency: { ...t.emergency, insurancePolicyEnc: v }, updatedAt: Date.now() });
        if (enqueue) await db.syncQueue.add({ table: "trips", docId: t.id, op: "put", at: Date.now(), label: `Trip · ${t.title}` });
      }
    }
  });
  return { rewritten, unreadable };
}

export interface UnlockResult {
  key: CryptoKey;
  /** Keys from the old per-device scheme that can still read not-yet-migrated data. */
  fallbackKeys: CryptoKey[];
  /** True when this device was just moved from a per-device salt to the shared key. */
  migrated: boolean;
}

/**
 * Unlock with a PIN.
 *  - Shared scheme: derive the deterministic key and check the local verifier.
 *  - Legacy scheme: check against the old per-device salt; on success migrate this device to the
 *    shared key (re-encrypting local data) so that every device ends up with one key.
 *  - If the local verifier rejects the PIN but the cloud verifier (`remote`) accepts it, the PIN
 *    was changed on another device: adopt it here.
 */
export async function unlockWithPin(pin: string, remote?: VaultKeyConfig | null): Promise<UnlockResult | null> {
  const cfg = await getLockConfig();
  if (!cfg) return null;
  const legacySalts = collectLegacySalts(cfg, remote);

  if (isSharedScheme(cfg)) {
    const key = await deriveVaultKey(pin);
    if (await verifierMatches(key, cfg.verifierB64)) {
      return { key, fallbackKeys: await deriveLegacyKeys(pin, legacySalts), migrated: false };
    }
    // PIN changed elsewhere? The cloud verifier is authoritative for the shared key.
    if (remote && isSharedScheme(remote) && (await verifierMatches(key, remote.verifierB64))) {
      await setSetting("lock", { ...cfg, verifierB64: remote.verifierB64, keyCreatedAt: remote.keyCreatedAt || Date.now(), legacySalts, biometric: undefined });
      await db.settings.delete("deviceKey");
      return { key, fallbackKeys: await deriveLegacyKeys(pin, legacySalts), migrated: true };
    }
    return null;
  }

  // Legacy per-device salt → verify with the old key, then migrate to the shared key.
  const legacyKey = await verifyPinAgainst(pin, cfg);
  if (!legacyKey) {
    // Maybe the PIN is the one used on the other devices (cloud verifier) — accept and migrate.
    if (remote && (await verifyPinAgainst(pin, remote))) {
      const key = await deriveVaultKey(pin);
      const fallbackKeys = await deriveLegacyKeys(pin, legacySalts);
      await reencryptAll(fallbackKeys, key);
      await writeSharedConfig(key, { legacySalts });
      await db.settings.delete("deviceKey");
      return { key, fallbackKeys, migrated: true };
    }
    return null;
  }
  const key = await deriveVaultKey(pin);
  const others = await deriveLegacyKeys(pin, legacySalts.filter((s) => s !== cfg.saltB64));
  const fallbackKeys = [legacyKey, ...others];
  await reencryptAll(fallbackKeys, key);
  // Keep biometrics working by re-wrapping the new master key with the existing device key.
  const bio = await rewrapBiometric(cfg, key);
  await writeSharedConfig(key, { legacySalts, keepBiometric: bio });
  if (!bio) await db.settings.delete("deviceKey");
  return { key, fallbackKeys, migrated: true };
}

/** Re-encrypt every sensitive field with the key for a new PIN. */
export async function changePin(oldKeys: CryptoKey[], newPin: string): Promise<CryptoKey> {
  const newKey = await deriveVaultKey(newPin);
  await reencryptAll(oldKeys, newKey);
  await writeSharedConfig(newKey);
  await db.settings.delete("deviceKey");
  return newKey;
}

export async function setAutoLock(minutes: number) {
  const cfg = await getLockConfig();
  if (cfg) await setSetting("lock", { ...cfg, autoLockMinutes: minutes });
}

/* ---------------- Biometric (WebAuthn) ---------------- */

export async function biometricSupported(): Promise<boolean> {
  try {
    if (!window.PublicKeyCredential || !window.isSecureContext) return false;
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

/** After the master key changed, wrap the new key with the existing device key (if any). */
async function rewrapBiometric(cfg: LockConfig, masterKey: CryptoKey): Promise<LockConfig["biometric"] | undefined> {
  const deviceKey = await getSetting<CryptoKey | null>("deviceKey", null);
  if (!cfg.biometric || !deviceKey) return undefined;
  try {
    const iv = rnd(12);
    const wrapped = await crypto.subtle.wrapKey("raw", masterKey, deviceKey, { name: "AES-GCM", iv: iv as BufferSource });
    return { credentialIdB64: cfg.biometric.credentialIdB64, wrappedKeyB64: b64(wrapped), ivB64: b64(iv) };
  } catch {
    return undefined;
  }
}

export async function enableBiometric(masterKey: CryptoKey): Promise<void> {
  const cfg = await getLockConfig();
  if (!cfg) throw new Error("Set a PIN first");
  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge: rnd(32),
      rp: { name: "Pack Rat", id: location.hostname },
      user: { id: rnd(16), name: "packrat-user", displayName: "Pack Rat" },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -257 },
      ],
      authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "preferred" },
      timeout: 60_000,
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error("Biometric enrolment cancelled");

  // Device key: non-extractable, lives only in this browser's IndexedDB.
  const deviceKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["wrapKey", "unwrapKey"]);
  const iv = rnd(12);
  const wrapped = await crypto.subtle.wrapKey("raw", masterKey, deviceKey, { name: "AES-GCM", iv: iv as BufferSource });
  await setSetting("deviceKey", deviceKey);
  await setSetting("lock", { ...cfg, biometric: { credentialIdB64: b64(cred.rawId), wrappedKeyB64: b64(wrapped), ivB64: b64(iv) } });
}

export async function disableBiometric() {
  const cfg = await getLockConfig();
  if (cfg) await setSetting("lock", { ...cfg, biometric: undefined });
  await db.settings.delete("deviceKey");
}

export async function unlockWithBiometric(): Promise<CryptoKey | null> {
  const cfg = await getLockConfig();
  const deviceKey = await getSetting<CryptoKey | null>("deviceKey", null);
  if (!cfg?.biometric || !deviceKey) return null;
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge: rnd(32),
      rpId: location.hostname,
      allowCredentials: [{ type: "public-key", id: unb64(cfg.biometric.credentialIdB64) as BufferSource }],
      userVerification: "required",
      timeout: 60_000,
    },
  });
  if (!assertion) return null;
  return crypto.subtle.unwrapKey(
    "raw",
    unb64(cfg.biometric.wrappedKeyB64) as BufferSource,
    deviceKey,
    { name: "AES-GCM", iv: unb64(cfg.biometric.ivB64) as BufferSource },
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}
