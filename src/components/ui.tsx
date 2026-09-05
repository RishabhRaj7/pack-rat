import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes, useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn, initials, colorFor } from "@/lib/utils";
import type { ReadyStatus } from "@/features/trips/types";

/* ---------- Button ---------- */
type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type Size = "sm" | "md" | "lg" | "icon";
export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean }>(
  ({ className, variant = "primary", size = "md", loading, children, disabled, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-all active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
        {
          primary: "bg-accent text-on-accent hover:brightness-110",
          secondary: "bg-accent-soft text-accent-strong hover:brightness-95 dark:hover:brightness-125",
          ghost: "text-accent hover:bg-accent-soft/50",
          outline: "border border-line text-fg hover:bg-surface-2",
          danger: "bg-danger-soft text-danger hover:brightness-95",
        }[variant],
        { sm: "h-8 px-3.5 text-xs", md: "h-10 px-5 text-sm", lg: "h-12 px-6 text-base", icon: "h-10 w-10 p-0" }[size],
        className
      )}
      {...props}
    >
      {loading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : children}
    </button>
  )
);
Button.displayName = "Button";

/* ---------- Inputs ---------- */
const fieldBase =
  "w-full rounded-xl border border-line bg-transparent px-3.5 py-2.5 text-sm text-fg placeholder:text-muted/60 transition focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => (
  <input ref={ref} className={cn(fieldBase, className)} {...p} />
));
Input.displayName = "Input";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...p }, ref) => (
  <textarea ref={ref} className={cn(fieldBase, "min-h-[84px] resize-y", className)} {...p} />
));
Textarea.displayName = "Textarea";

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, ...p }, ref) => (
  <select ref={ref} className={cn(fieldBase, "appearance-none bg-no-repeat pr-9", className)} style={{ backgroundImage: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%239aa3ad' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>\")", backgroundPosition: "right 0.75rem center" }} {...p}>
    {children}
  </select>
));
Select.displayName = "Select";

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1.5 block text-xs font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

/* ---------- Card ---------- */
export function Card({ className, children, onClick, as: Tag = "div" }: { className?: string; children: ReactNode; onClick?: () => void; as?: "div" | "section" | "article" }) {
  return (
    <Tag onClick={onClick} className={cn("rounded-3xl bg-surface shadow-card", onClick && "cursor-pointer transition hover:bg-surface-2", className)}>
      {children}
    </Tag>
  );
}

/* ---------- Badge / Chip ---------- */
export function Badge({ children, tone = "neutral", className }: { children: ReactNode; tone?: "neutral" | "ok" | "warn" | "danger" | "accent"; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[11px] font-medium",
        {
          neutral: "bg-surface-2 text-muted",
          ok: "bg-ok-soft text-ok",
          warn: "bg-warn-soft text-warn",
          danger: "bg-danger-soft text-danger",
          accent: "bg-accent-soft text-accent-strong",
        }[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

export function Chip({ active, children, onClick, className }: { active?: boolean; children: ReactNode; onClick?: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-lg border px-3 py-1.5 text-xs font-medium transition",
        active ? "border-transparent bg-accent-soft text-accent-strong" : "border-line bg-transparent text-fg hover:bg-surface-2",
        className
      )}
    >
      {children}
    </button>
  );
}

/* ---------- Status indicator ---------- */
export const STATUS_META: Record<ReadyStatus, { label: string; tone: "danger" | "warn" | "ok"; dot: string }> = {
  action: { label: "Action needed", tone: "danger", dot: "bg-danger" },
  progress: { label: "In progress", tone: "warn", dot: "bg-warn" },
  ready: { label: "Confirmed", tone: "ok", dot: "bg-ok" },
};
export function StatusDot({ status, className, pulse }: { status: ReadyStatus; className?: string; pulse?: boolean }) {
  return (
    <span className={cn("relative inline-flex h-2.5 w-2.5 shrink-0", className)} title={STATUS_META[status].label}>
      {pulse && status !== "ready" && <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-60", STATUS_META[status].dot)} />}
      <span className={cn("relative inline-flex h-2.5 w-2.5 rounded-full", STATUS_META[status].dot)} />
    </span>
  );
}
export function StatusBadge({ status }: { status: ReadyStatus }) {
  return (
    <Badge tone={STATUS_META[status].tone}>
      <StatusDot status={status} className="h-1.5 w-1.5 [&>span]:h-1.5 [&>span]:w-1.5" />
      {STATUS_META[status].label}
    </Badge>
  );
}

/* ---------- Avatar ---------- */
export function Avatar({ name, src, size = 40, className }: { name: string; src?: string | null; size?: number; className?: string }) {
  return src ? (
    <img src={src} alt={name} style={{ width: size, height: size }} className={cn("shrink-0 rounded-full object-cover ring-2 ring-surface", className)} />
  ) : (
    <div
      style={{ width: size, height: size, background: colorFor(name), fontSize: size * 0.38 }}
      className={cn("flex shrink-0 items-center justify-center rounded-full font-bold text-white ring-2 ring-surface", className)}
    >
      {initials(name) || "?"}
    </div>
  );
}

/* ---------- Modal ---------- */
export function Modal({ open, onClose, title, children, footer, size = "md" }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; size?: "sm" | "md" | "lg" }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);
  if (!open || typeof document === "undefined") return null;
  // Portal to <body>: ancestors with backdrop-filter / transform (e.g. the blurred mobile header,
  // the sticky sidebar) would otherwise become the containing block and clip a fixed overlay.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className={cn(
          "animate-fade-up flex max-h-[92vh] w-full flex-col rounded-t-[28px] bg-surface shadow-2xl sm:rounded-[28px]",
          { sm: "sm:max-w-sm", md: "sm:max-w-lg", lg: "sm:max-w-2xl" }[size]
        )}
        role="dialog"
        aria-modal
      >
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <h2 className="text-xl font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded-full p-1.5 text-muted hover:bg-surface-2 hover:text-fg" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-2">{children}</div>
        {footer && <div className="flex justify-end gap-2 px-6 py-4 safe-bottom">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

/* ---------- Empty state ---------- */
export function EmptyState({ icon, title, hint, action }: { icon: ReactNode; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-3xl bg-surface-2/60 px-6 py-10 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-accent-strong [&>svg]:h-5 [&>svg]:w-5">{icon}</div>
      <p className="font-semibold">{title}</p>
      {hint && <p className="mt-1 max-w-xs text-sm text-muted">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* ---------- Page header ---------- */
export function PageHeader({ title, subtitle, action, back }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; back?: ReactNode }) {
  return (
    <div className="mb-5 flex items-start justify-between gap-3">
      <div className="min-w-0">
        {back}
        <h1 className="truncate text-[28px] font-semibold leading-tight tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; className?: string }) {
  return (
    <div className={cn("inline-flex overflow-hidden rounded-full border border-line", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn("px-3.5 py-1.5 text-xs font-medium transition border-r border-line last:border-r-0", value === o.value ? "bg-accent-soft text-accent-strong" : "text-fg hover:bg-surface-2")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn("relative h-7 w-12 shrink-0 rounded-full border-2 transition", checked ? "border-accent bg-accent" : "border-muted bg-surface-2")}
    >
      <span className={cn("absolute top-1/2 -translate-y-1/2 rounded-full transition-all", checked ? "left-[22px] h-5 w-5 bg-on-accent" : "left-1 h-3.5 w-3.5 bg-muted")} />
    </button>
  );
}
