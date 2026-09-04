import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getLockConfig, setupPin, unlockWithPin, unlockWithBiometric, biometricSupported, enableBiometric, disableBiometric, changePin, setAutoLock, type LockConfig, encryptString, decryptString } from "@/lib/crypto";

type LockState = "loading" | "setup" | "locked" | "unlocked";

interface LockCtx {
  state: LockState;
  key: CryptoKey | null;
  config: LockConfig | null;
  biometricAvailable: boolean;
  setup: (pin: string) => Promise<void>;
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
    setState((s) => (s === "setup" ? s : "locked"));
  }, []);

  // Auto-lock when the app has been in the background longer than the configured timeout
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "hidden") hiddenAt.current = Date.now();
      else if (hiddenAt.current && state === "unlocked") {
        const mins = config?.autoLockMinutes ?? 5;
        if (mins > 0 && Date.now() - hiddenAt.current > mins * 60_000) lock();
        hiddenAt.current = null;
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [state, config, lock]);

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
        setKey(k);
        setConfig(await getLockConfig());
        setState("unlocked");
      },
      unlockPin: async (pin) => {
        const k = await unlockWithPin(pin);
        if (!k) return false;
        setKey(k);
        setState("unlocked");
        return true;
      },
      unlockBiometric: async () => {
        try {
          const k = await unlockWithBiometric();
          if (!k) return false;
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
        const k = await changePin(key, pin);
        setKey(k);
        setConfig(await getLockConfig());
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
        return decryptString(key, enc);
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
