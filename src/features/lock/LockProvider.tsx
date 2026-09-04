import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  getLockConfig,
  setupPin,
  setupPinFromRemote,
  unlockWithPin,
  unlockWithBiometric,
  biometricSupported,
  enableBiometric,
  disableBiometric,
  changePin,
  setAutoLock,
  encryptString,
  decryptWithAny,
  reencryptAll,
  deriveLegacyKeys,
  collectLegacySalts,
  type LockConfig,
  type VaultKeyConfig,
} from "@/lib/crypto";
import { getSyncState, publishVaultKey, recheckVaultKey, requestFlush, useSyncStatus } from "@/lib/sync";

type LockState = "loading" | "setup" | "locked" | "unlocked";

interface LockCtx {
  state: LockState;
  key: CryptoKey | null;
  config: LockConfig | null;
  biometricAvailable: boolean;
  setup: (pin: string) => Promise<void>;
  /** First run on a signed-in device: check the PIN against the cloud verifier first. Returns false if the PIN doesn't match. */
  setupFromRemote: (pin: string, remote: VaultKeyConfig) => Promise<boolean>;
  unlockPin: (pin: string) => Promise<boolean>;
  unlockBiometric: () => Promise<boolean>;
  lock: () => void;
  enableBio: () => Promise<void>;
  disableBio: () => Promise<void>;
  changePin: (pin: string) => Promise<void>;
  setAutoLockMinutes: (m: number) => Promise<void>;
  encrypt: (plain: string) => Promise<string>;
  decrypt: (enc: string) => Promise<string>;
  refresh: () => Promise<void>;
}

const Ctx = createContext<LockCtx | null>(null);

export function LockProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<LockState>("loading");
  const [key, setKey] = useState<CryptoKey | null>(null);
  const [config, setConfig] = useState<LockConfig | null>(null);
  const [biometricAvailable, setBio] = useState(false);
  const hiddenAt = useRef<number | null>(null);
  // Keys from the old per-device scheme (derived from the same PIN). Only used to read
  // not-yet-migrated ciphertext; everything readable with them is re-encrypted with `key`.
  const fallbackKeys = useRef<CryptoKey[]>([]);
  const sync = useSyncStatus();

  const refresh = useCallback(async () => {
    const cfg = await getLockConfig();
    setConfig(cfg);
    if (!cfg) setState("setup");
    else setState((s) => (s === "unlocked" ? s : "locked"));
  }, []);

  useEffect(() => {
    void refresh();
    biometricSupported().then(setBio);
  }, [refresh]);

  const lock = useCallback(() => {
    setKey(null);
    fallbackKeys.current = [];
    setState((s) => (s === "setup" ? s : "locked"));
  }, []);

  // Auto-lock when the app has been in the background longer than the configured timeout.
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "hidden") hiddenAt.current = Date.now();
      else if (hiddenAt.current && state === "unlocked") {
        const mins = config?.autoLockMinutes ?? 5;
        if (Date.now() - hiddenAt.current >= mins * 60_000) lock();
        hiddenAt.current = null;
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [state, config, lock]);

  // Convert any legacy ciphertext (encrypted under an old per-device salt) to the shared key.
  // Runs right after unlock and again whenever new records arrive from other devices.
  const converting = useRef(false);
  const convertLegacy = useCallback(async (k: CryptoKey) => {
    if (!fallbackKeys.current.length || converting.current) return;
    converting.current = true;
    try {
      const r = await reencryptAll(fallbackKeys.current, k);
      if (r.rewritten) requestFlush();
    } catch {
      /* best effort */
    } finally {
      converting.current = false;
    }
  }, []);
  const lastPullAt = sync.lastPull?.at ?? null;
  useEffect(() => {
    if (state === "unlocked" && key) void convertLegacy(key);
  }, [state, key, lastPullAt, convertLegacy]);

  const value = useMemo<LockCtx>(
    () => ({
      state,
      key,
      config,
      biometricAvailable,
      refresh,
      lock,
      setup: async (pin) => {
        const k = await setupPin(pin);
        fallbackKeys.current = [];
        setKey(k);
        setConfig(await getLockConfig());
        setState("unlocked");
        void publishVaultKey().catch(() => undefined);
      },
      setupFromRemote: async (pin, remote) => {
        const k = await setupPinFromRemote(pin, remote);
        if (!k) return false;
        // Same PIN, so the other devices' legacy keys are derivable — keep them for reading old records.
        fallbackKeys.current = await deriveLegacyKeys(pin, collectLegacySalts(remote));
        setKey(k);
        setConfig(await getLockConfig());
        setState("unlocked");
        void recheckVaultKey().catch(() => undefined);
        return true;
      },
      unlockPin: async (pin) => {
        const r = await unlockWithPin(pin, getSyncState().vaultKey.remote);
        if (!r) return false;
        fallbackKeys.current = r.fallbackKeys;
        setKey(r.key);
        setConfig(await getLockConfig());
        setState("unlocked");
        if (r.migrated) {
          // This device just moved to the shared key: tell the cloud and push re-encrypted rows.
          void publishVaultKey(true).catch(() => undefined);
          requestFlush();
        } else void recheckVaultKey().catch(() => undefined);
        return true;
      },
      unlockBiometric: async () => {
        try {
          const k = await unlockWithBiometric();
          if (!k) return false;
          fallbackKeys.current = [];
          setKey(k);
          setState("unlocked");
          return true;
        } catch {
          return false;
        }
      },
      enableBio: async () => {
        if (!key) throw new Error("Unlock first");
        await enableBiometric(key);
        setConfig(await getLockConfig());
      },
      disableBio: async () => {
        await disableBiometric();
        setConfig(await getLockConfig());
      },
      changePin: async (pin) => {
        if (!key) throw new Error("Unlock first");
        const k = await changePin([key, ...fallbackKeys.current], pin);
        fallbackKeys.current = [];
        setKey(k);
        setConfig(await getLockConfig());
        // The new verifier becomes the shared one; other devices simply unlock with the new PIN.
        await publishVaultKey(true).catch(() => undefined);
        requestFlush();
      },
      setAutoLockMinutes: async (m) => {
        await setAutoLock(m);
        setConfig(await getLockConfig());
      },
      encrypt: async (plain) => {
        if (!key) throw new Error("Vault is locked");
        return encryptString(key, plain);
      },
      decrypt: async (enc) => {
        if (!key) throw new Error("Vault is locked");
        return decryptWithAny([key, ...fallbackKeys.current], enc);
      },
    }),
    [state, key, config, biometricAvailable, refresh, lock]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLock() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useLock outside LockProvider");
  return ctx;
}
