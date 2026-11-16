import { useEffect, type ReactNode } from "react";
import { create } from "zustand";
import clsx from "clsx";
import { X, CheckCircle2, AlertTriangle, Info } from "lucide-react";

/* Toasts ------------------------------------------------------------ */

type ToastKind = "info" | "success" | "error";
interface ToastItem {
  id: number;
  kind: ToastKind;
  text: string;
}

const useToasts = create<{ items: ToastItem[] }>(() => ({ items: [] }));
let toastId = 0;

export function toast(text: string, kind: ToastKind = "info", ms = 3200) {
  const id = ++toastId;
  useToasts.setState((s) => ({ items: [...s.items, { id, kind, text }].slice(-4) }));
  setTimeout(() => useToasts.setState((s) => ({ items: s.items.filter((i) => i.id !== id) })), ms);
}

export function Toaster() {
  const items = useToasts((s) => s.items);
  return (
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-[100] flex -translate-x-1/2 flex-col items-center gap-2">
      {items.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto flex animate-rise items-center gap-2 rounded-lg border border-line bg-ink-3/95 px-3.5 py-2 text-[13px] text-paper shadow-2xl backdrop-blur"
        >
          {t.kind === "success" && <CheckCircle2 size={15} className="text-moss" />}
          {t.kind === "error" && <AlertTriangle size={15} className="text-danger" />}
          {t.kind === "info" && <Info size={15} className="text-amber" />}
          {t.text}
        </div>
      ))}
    </div>
  );
}

/* Modal ------------------------------------------------------------- */

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  width = 520,
  dismissable = true,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
  dismissable?: boolean;
}) {
  useEffect(() => {
    if (!open || !dismissable) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, dismissable]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex animate-fade items-center justify-center bg-black/60 p-6 backdrop-blur-[2px]" onPointerDown={(e) => dismissable && e.target === e.currentTarget && onClose()}>
      <div className="flex max-h-full animate-rise flex-col overflow-hidden rounded-xl border border-line bg-ink-2 shadow-[0_30px_80px_-20px_rgba(0,0,0,.8)]" style={{ width }}>
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-line px-4">
          <div className="text-sm font-semibold">{title}</div>
          {dismissable && (
            <button className="rounded-md p-1 text-fog hover:bg-ink-4 hover:text-paper" onClick={onClose} aria-label="关闭">
              <X size={16} />
            </button>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        {footer && <div className="flex shrink-0 items-center justify-end gap-2 border-t border-line px-4 py-3">{footer}</div>}
      </div>
    </div>
  );
}

/* Brand ------------------------------------------------------------- */

export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={className} aria-hidden>
      <rect x="2" y="2" width="60" height="60" rx="14" fill="#1C1815" />
      <rect x="9" y="9" width="46" height="46" rx="6" fill="none" stroke="#FF5A36" strokeWidth="3" />
      <g fill="#FF5A36">
        {[14, 29, 44].map((x) => (
          <g key={x}>
            <rect x={x} y="4.5" width="6" height="3" rx="1" />
            <rect x={x} y="56.5" width="6" height="3" rx="1" />
          </g>
        ))}
      </g>
      <g transform="translate(32 32)">
        <path
          fill="#ECE6DF"
          d="M-3.2,-15 h6.4 l1.2,4.6 a11,11 0 0 1 4.3,2.5 l4.6,-1.3 l3.2,5.5 l-3.4,3.3 a11,11 0 0 1 0,4.9 l3.4,3.3 l-3.2,5.5 l-4.6,-1.3 a11,11 0 0 1 -4.3,2.5 l-1.2,4.6 h-6.4 l-1.2,-4.6 a11,11 0 0 1 -4.3,-2.5 l-4.6,1.3 l-3.2,-5.5 l3.4,-3.3 a11,11 0 0 1 0,-4.9 l-3.4,-3.3 l3.2,-5.5 l4.6,1.3 a11,11 0 0 1 4.3,-2.5 z"
        />
        <circle r="5" fill="#1C1815" />
        <circle r="2.2" fill="#FF5A36" />
      </g>
    </svg>
  );
}

export function Wordmark({ className, size = "md" }: { className?: string; size?: "md" | "lg" }) {
  return (
    <span className={clsx("inline-flex items-center gap-2 font-brand tracking-tight", size === "lg" ? "text-3xl" : "text-[17px]", className)}>
      <LogoMark size={size === "lg" ? 40 : 24} />
      <span>
        <span className="font-medium text-mist">Clip</span>
        <span className={clsx("mx-[3px] inline-block bg-safelight align-middle", size === "lg" ? "h-2 w-2" : "h-1.5 w-1.5")} />
        <span className="font-bold text-paper">Mill</span>
      </span>
    </span>
  );
}

export function Pill({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={clsx("inline-flex items-center rounded-full border border-line px-2 py-px text-[11px] text-fog", className)}>{children}</span>;
}

export function GithubIcon({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} fill="currentColor" aria-hidden>
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.88-1.54-3.88-1.54-.52-1.33-1.28-1.68-1.28-1.68-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.79 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.12 3.05.74.81 1.19 1.84 1.19 3.1 0 4.42-2.7 5.39-5.26 5.68.41.36.78 1.06.78 2.14 0 1.55-.01 2.8-.01 3.18 0 .31.21.68.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
    </svg>
  );
}
