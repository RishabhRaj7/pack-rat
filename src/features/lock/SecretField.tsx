import { useEffect, useState } from "react";
import { Copy, Check, Eye, EyeOff } from "lucide-react";
import { useLock } from "./LockProvider";
import { copyToClipboard, cn } from "@/lib/utils";

/** Decrypts an encrypted value and shows it masked with reveal + copy-to-clipboard. */
export function SecretField({ value, className, mono = true, revealByDefault = false }: { value?: string; className?: string; mono?: boolean; revealByDefault?: boolean }) {
  const { decrypt, state } = useLock();
  const [plain, setPlain] = useState<string>("");
  const [show, setShow] = useState(revealByDefault);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!value || state !== "unlocked") return setPlain("");
    decrypt(value)
      .then((p) => alive && setPlain(p))
      .catch(() => alive && setPlain(""));
    return () => {
      alive = false;
    };
  }, [value, state, decrypt]);

  if (!value) return <span className="text-muted">—</span>;
  const masked = plain ? plain.slice(0, 2) + "•".repeat(Math.max(4, plain.length - 4)) + plain.slice(-2) : "••••••";

  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span className={cn("tracking-wider", mono && "font-mono text-[13px]")}>{show ? plain : masked}</span>
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

/** Controlled input whose plaintext is decrypted on mount and encrypted on save by the parent via `useLock().encrypt`. */
export function useDecrypted(enc?: string) {
  const { decrypt, state } = useLock();
  const [plain, setPlain] = useState("");
  const [ready, setReady] = useState(!enc);
  useEffect(() => {
    if (!enc || state !== "unlocked") return;
    decrypt(enc)
      .then(setPlain)
      .finally(() => setReady(true));
  }, [enc, state, decrypt]);
  return { plain, setPlain, ready };
}
