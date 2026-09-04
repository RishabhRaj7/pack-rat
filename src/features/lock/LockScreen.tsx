import { useEffect, useState } from "react";
import { Fingerprint, Lock, ShieldCheck, Delete } from "lucide-react";
import { useLock } from "./LockProvider";
import { cn } from "@/lib/utils";
import { fetchRemoteVaultKey, useSyncStatus } from "@/lib/sync";
import type { VaultKeyConfig } from "@/lib/crypto";

function PinPad({ value, onChange, length = 6 }: { value: string; onChange: (v: string) => void; length?: number }) {
  const press = (d: string) => value.length < length && onChange(value + d);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      if (e.key === "Backspace") onChange(value.slice(0, -1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  return (
    <div>
      <div className="mb-6 flex justify-center gap-3">
        {Array.from({ length }).map((_, i) => (
          <span key={i} className={cn("h-3.5 w-3.5 rounded-full border-2 transition", i < value.length ? "border-accent bg-accent" : "border-line")} />
        ))}
      </div>
      <div className="mx-auto grid max-w-[260px] grid-cols-3 gap-2">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].map((k, i) => (
          <button
            key={i}
            type="button"
            disabled={k === ""}
            onClick={() => (k === "⌫" ? onChange(value.slice(0, -1)) : press(k))}
            className={cn("h-16 rounded-2xl text-xl font-semibold transition active:scale-95", k === "" ? "invisible" : "bg-surface-2 hover:bg-accent-soft")}
          >
            {k === "⌫" ? <Delete className="mx-auto" size={20} /> : k}
          </button>
        ))}
      </div>
    </div>
  );
}

export function LockScreen() {
  const lock = useLock();
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [stage, setStage] = useState<"enter" | "confirm">("enter");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isSetup = lock.state === "setup";
  const canBio = !!lock.config?.biometric && lock.biometricAvailable;
  const sync = useSyncStatus();
  // First run on a device that is already signed in: reuse the shared vault key config so
  // ID numbers synced from the other device decrypt with the same PIN.
  const [remoteKey, setRemoteKey] = useState<VaultKeyConfig | null | undefined>(undefined);
  useEffect(() => {
    if (!isSetup || !sync.user) { setRemoteKey(null); return; }
    fetchRemoteVaultKey().then(setRemoteKey).catch(() => setRemoteKey(null));
  }, [isSetup, sync.user]);
  const joinExisting = isSetup && !!remoteKey;

  // Try biometric immediately on lock screen
  useEffect(() => {
    if (!isSetup && canBio) void lock.unlockBiometric();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSetup, canBio]);

  useEffect(() => {
    if (pin.length !== 6) return;
    (async () => {
      setBusy(true);
      setError(null);
      if (joinExisting && remoteKey) {
        const ok = await lock.setupFromRemote(pin, remoteKey);
        if (!ok) {
          setError("That isn't the PIN used on your other device");
          setPin("");
        }
      } else if (isSetup) {
        if (stage === "enter") {
          setConfirm(pin);
          setPin("");
          setStage("confirm");
        } else if (pin === confirm) await lock.setup(pin);
        else {
          setError("PINs didn't match — start again");
          setPin("");
          setConfirm("");
          setStage("enter");
        }
      } else {
        const ok = await lock.unlockPin(pin);
        if (!ok) {
          setError("Wrong PIN");
          setPin("");
        }
      }
      setBusy(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  return (
    <div className="flex min-h-full items-center justify-center bg-bg p-6">
      <div className="w-full max-w-sm animate-fade-up rounded-3xl border border-line bg-surface p-8 shadow-card">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-soft text-accent-strong">{isSetup ? <ShieldCheck size={28} /> : <Lock size={26} />}</div>
          <h1 className="text-xl font-extrabold tracking-tight">{joinExisting ? "Enter your existing vault PIN" : isSetup ? (stage === "enter" ? "Create your vault PIN" : "Confirm your PIN") : "Pack Rat is locked"}</h1>
          <p className="mt-1.5 text-sm text-muted">
            {joinExisting
              ? `You're signed in as ${sync.user?.email ?? "your account"}. Enter the PIN you use on your other device so synced ID numbers can be decrypted here.`
              : isSetup
              ? "Your PIN encrypts ID numbers, loyalty numbers and policy numbers. It is never stored — if you forget it, encrypted fields cannot be recovered."
              : "Enter your 6-digit PIN to view your documents and trips."}
          </p>
        </div>
        <PinPad value={pin} onChange={(v) => !busy && setPin(v)} />
        {joinExisting && <button type="button" onClick={() => { setRemoteKey(null); setPin(""); setError(null); }} className="mx-auto mt-3 block text-xs font-semibold text-muted hover:text-fg">Start fresh with a new PIN instead</button>}
        <div className="mt-5 min-h-[20px] text-center text-sm font-medium text-danger">{error}</div>
        {!isSetup && canBio && (
          <button onClick={() => lock.unlockBiometric()} className="mx-auto mt-2 flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-accent hover:bg-accent-soft">
            <Fingerprint size={18} /> Use biometrics
          </button>
        )}
      </div>
    </div>
  );
}
