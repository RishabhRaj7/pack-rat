/**
 * Field-level encryption for sensitive data (ID numbers, loyalty numbers, policy numbers).
 *
 *  - A master AES-GCM-256 key is derived from the user's PIN with PBKDF2 (310k iterations, random salt).
 *  - The key only ever lives in memory while the app is unlocked; only a salt + verifier are persisted.
 *  - Biometric unlock (WebAuthn platform authenticator): the master key is wrapped with a
 *    non-extractable device key stored in IndexedDB, and is only unwrapped after a successful
 *    WebAuthn assertion. Ciphertext is stored as "enc1.<iv>.<ct>" (base64).
 */
import { db, getSetting, setSetting } from "./db";

const ITERATIONS = 310_000;
const PREFIX = "enc1.";

export interface LockConfig {
  saltB64: string;
  verifierB64: string; // encrypt("passport-ok")
  iterations: number;
  autoLockMinutes: number;
  /** When this salt/verifier pair was created (used to reconcile across devices). */
  keyCreatedAt?: number;
  biometric?: { credentialIdB64: string; wrappedKeyB64: string; ivB64: string };
}

/**
 * The part of the lock config that must be identical on every device so that
 * the same PIN derives the same AES key. Contains NO secret material:
 * the salt is public by design and the verifier is just AES-GCM("passport-ok").
 */
export interface VaultKeyConfig {
  saltB64: string;
  verifierB64: string;
  iterations: number;
  keyCreatedAt: number;
}

export const vaultKeyOf = (cfg: LockConfig): VaultKeyConfig => ({ saltB64: cfg.saltB64, verifierB64: cfg.verifierB64, iterations: cfg.iterations, keyCreatedAt: cfg.keyCreatedAt ?? 0 });
export const sameVaultKey = (a?: VaultKeyConfig | LockConfig | null, b?: VaultKeyConfig | LockConfig | null) => !!a && !!b && a.saltB64 === b.saltB64 && a.iterations === b.iterations;

const enc = new TextEncoder();
const dec = new TextDecoder();
const b64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const rnd = (n: number) => crypto.getRandomValues(new Uint8Array(n));

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

export async function setupPin(pin: string, autoLockMinutes = 5): Promise<CryptoKey> {
  const salt = rnd(16);
  const key = await deriveKey(pin, salt, ITERATIONS);
  const verifier = await encryptString(key, "passport-ok");
  const cfg: LockConfig = { saltB64: b64(salt), verifierB64: verifier, iterations: ITERATIONS, autoLockMinutes, keyCreatedAt: Date.now() };
  await setSetting("lock", cfg);
  return key;
}

/** Derive a key from `pin` using another device's salt and check it against that device's verifier. */
export async function deriveFromVaultKey(pin: string, remote: VaultKeyConfig): Promise<CryptoKey | null> {
  const key = await deriveKey(pin, unb64(remote.saltB64), remote.iterations);
  try {
    return (await decryptString(key, remote.verifierB64)) === "passport-ok" ? key : null;
  } catch {
    return null;
  }
}

/**
 * First-run on a device that is already signed in: set up the lock using the salt that
 * the other devices use, so ID numbers synced from them decrypt straight away.
 */
export async function setupPinFromRemote(pin: string, remote: VaultKeyConfig, autoLockMinutes = 5): Promise<CryptoKey | null> {
  const key = await deriveFromVaultKey(pin, remote);
  if (!key) return null;
  await setSetting("lock", { ...remote, autoLockMinutes } satisfies LockConfig);
  return key;
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
 * Fields already readable with `newKey` are left untouched; fields readable with `oldKey`
 * are re-encrypted; anything else (encrypted with a third key) is left as-is.
 * Returns the ids of records that were rewritten.
 */
export async function reencryptAll(oldKey: CryptoKey | null, newKey: CryptoKey, enqueue = true): Promise<{ rewritten: number; unreadable: number }> {
  let rewritten = 0;
  let unreadable = 0;
  const re = async (v?: string): Promise<string | undefined | null> => {
    if (!v) return v;
    if (await canDecrypt(newKey, v)) return null; // already fine
    if (oldKey && (await canDecrypt(oldKey, v))) return encryptString(newKey, await decryptString(oldKey, v));
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

/**
 * Switch this device to the vault key used by the other devices (same PIN, their salt).
 * Everything encrypted with the current local key is re-encrypted so the whole family
 * of devices shares one key. Biometric unlock must be re-enabled afterwards.
 */
export async function adoptRemoteVaultKey(localKey: CryptoKey | null, pin: string, remote: VaultKeyConfig): Promise<{ key: CryptoKey; rewritten: number; unreadable: number }> {
  const key = await deriveFromVaultKey(pin, remote);
  if (!key) throw new Error("That PIN does not match the one used on your other device");
  const stats = await reencryptAll(localKey, key);
  const cfg = await getLockConfig();
  await setSetting("lock", { ...(cfg ?? { autoLockMinutes: 5 }), ...remote, biometric: undefined } satisfies LockConfig);
  await db.settings.delete("deviceKey");
  return { key, ...stats };
}

export async function unlockWithPin(pin: string): Promise<CryptoKey | null> {
  const cfg = await getLockConfig();
  if (!cfg) return null;
  const key = await deriveKey(pin, unb64(cfg.saltB64), cfg.iterations);
  try {
    const ok = await decryptString(key, cfg.verifierB64);
    return ok === "passport-ok" ? key : null;
  } catch {
    return null;
  }
}

/** Re-encrypt every sensitive field with a new key (used when changing PIN). */
export async function changePin(oldKey: CryptoKey, newPin: string): Promise<CryptoKey> {
  const cfg = (await getLockConfig())!;
  const salt = rnd(16);
  const newKey = await deriveKey(newPin, salt, ITERATIONS);
  const re = async (v?: string) => (v ? encryptString(newKey, await decryptString(oldKey, v)) : v);

  await db.transaction("rw", db.documents, db.loyalty, db.trips, db.syncQueue, async () => {
    for (const d of await db.documents.toArray()) {
      await db.documents.update(d.id, { numberEnc: await re(d.numberEnc), updatedAt: Date.now() });
      await db.syncQueue.add({ table: "documents", docId: d.id, op: "put", at: Date.now() });
    }
    for (const l of await db.loyalty.toArray()) {
      await db.loyalty.update(l.id, { numberEnc: await re(l.numberEnc), updatedAt: Date.now() });
      await db.syncQueue.add({ table: "loyalty", docId: l.id, op: "put", at: Date.now() });
    }
    for (const t of await db.trips.toArray()) {
      if (t.emergency?.insurancePolicyEnc) {
        await db.trips.update(t.id, { emergency: { ...t.emergency, insurancePolicyEnc: await re(t.emergency.insurancePolicyEnc) }, updatedAt: Date.now() });
        await db.syncQueue.add({ table: "trips", docId: t.id, op: "put", at: Date.now() });
      }
    }
  });
  const verifier = await encryptString(newKey, "passport-ok");
  await setSetting("lock", { ...cfg, saltB64: b64(salt), verifierB64: verifier, iterations: ITERATIONS, keyCreatedAt: Date.now(), biometric: undefined });
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

export async function enableBiometric(masterKey: CryptoKey): Promise<void> {
  const cfg = await getLockConfig();
  if (!cfg) throw new Error("Set a PIN first");
  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge: rnd(32),
      rp: { name: "Passport", id: location.hostname },
      user: { id: rnd(16), name: "passport-user", displayName: "Passport" },
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
