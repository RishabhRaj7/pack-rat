import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Copy, Check, Eye, EyeOff, KeyRound } from "lucide-react";
import { useLock } from "./LockProvider";
import { copyToClipboard, cn } from "@/lib/utils";
import { isEncrypted } from "@/lib/crypto";

type DecryptState = "idle" | "ok" | "unreadable";

/** Decrypts an encrypted value and shows it masked with reveal + copy-to-clipboard. */
export function SecretField({ value, className, mono = true, revealByDefault = false }: { value?: string; className?: string; mono?: boolean; revealByDefault?: boolean }) {
  const { decrypt, state, key } = useLock();
  const [plain, setPlain] = useState<string>("");
  const [status, setStatus] = useState<DecryptState>("idle");
  const [show, setShow] = useState(revealByDefault);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!value || state !== "unlocked") {
      setPlain("");
      setStatus("idle");
      return;
    }
    decrypt(value)
      .then((p) => {
        if (!alive) return;
        setPlain(p);
        setStatus("ok");
      })
      .catch(() => {
        if (!alive) return;
        setPlain("");
        setStatus("unreadable");
      });
    return () => {
      alive = false;
    };
    // `key` is included so a merge / PIN change re-runs decryption immediately.
  }, [value, state, decrypt, key]);

  if (!value) return <span className="text-muted">—</span>;

  // Encrypted on another device with a different PIN/salt → cannot be shown until keys are merged.
  if (status === "unreadable") {
    return (
      <span className={cn("inline-flex flex-wrap items-center gap-1.5 text-xs", className)} title="This value was encrypted with a different vault key. Open Settings → Cloud sync → Merge vault keys.">
        <span className={cn("tracking-wider text-muted", mono && "font-mono text-[13px]")}>••••••</span>
        <Link to="/settings?merge=1" className="inline-flex items-center gap-1 rounded-full bg-warn-soft px-2 py-0.5 font-semibold text-warn hover:brightness-95">
          <KeyRound size={11} /> Encrypted with another device&apos;s PIN — merge
        </Link>
      </span>
    );
  }

  const masked = plain ? plain.slice(0, 2) + "•".repeat(Math.max(4, plain.length - 4)) + plain.slice(-2) : "••••••";

  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span className={cn("tracking-wider", mono && "font-mono text-[13px]")}>{show ? plain || <span className="text-muted">(empty)</span> : masked}</span>
      <button type="button" onClick={() => setShow((s) => !s)} className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-fg" title={show ? "Hide" : "Reveal"}>
        {show ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
      <button
        type="button"
        onClick={async () => {
          if (await copyToClipboard(plain)) {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }
        }}
        className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-accent"
        title="Copy"
      >
        {copied ? <Check size={14} className="text-ok" /> : <Copy size={14} />}
      </button>
    </span>
  );
}

/**
 * Controlled input whose plaintext is decrypted on mount and encrypted on save by the parent via `useLock().encrypt`.
 * If the stored value cannot be decrypted with this device's key (`unreadable`), `plain` stays empty and
 * callers should keep the original ciphertext instead of overwriting it — see `keepIfUnreadable`.
 */
export function useDecrypted(enc?: string) {
  const { decrypt, state, key } = useLock();
  const [plain, setPlain] = useState("");
  const [ready, setReady] = useState(!enc);
  const [unreadable, setUnreadable] = useState(false);
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (!enc || state !== "unlocked") return;
    let alive = true;
    decrypt(enc)
      .then((p) => {
        if (!alive) return;
        setPlain(p);
        setUnreadable(false);
      })
      .catch(() => {
        if (!alive) return;
        setPlain("");
        setUnreadable(isEncrypted(enc));
      })
      .finally(() => alive && setReady(true));
    return () => {
      alive = false;
    };
  }, [enc, state, decrypt, key]);

  /** Returns the ciphertext to persist: re-encrypt the edited value, or keep the original when it couldn't be read and wasn't changed. */
  const keepIfUnreadable = async (encryptFn: (plain: string) => Promise<string>, allowEmpty = true) => {
    if (unreadable && !touched) return enc ?? "";
    const v = plain.trim();
    if (!v && !allowEmpty) return undefined;
    return encryptFn(v);
  };

  return {
    plain,
    setPlain: (v: string) => {
      setTouched(true);
      setPlain(v);
    },
    ready,
    unreadable,
    keepIfUnreadable,
  };
}
