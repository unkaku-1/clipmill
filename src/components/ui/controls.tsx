import { useEffect, useRef, useState, type ReactNode } from "react";
import clsx from "clsx";
import { ChevronDown } from "lucide-react";

/* Buttons ---------------------------------------------------------- */

type BtnVariant = "primary" | "ghost" | "subtle" | "danger" | "outline";

export function Button({
  variant = "subtle",
  size = "md",
  className,
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: "sm" | "md" | "lg" }) {
  return (
    <button
      {...rest}
      className={clsx(
        "inline-flex items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap transition-[background,color,box-shadow,transform] duration-150 ease-out active:translate-y-px disabled:pointer-events-none disabled:opacity-40",
        size === "sm" && "h-7 px-2.5 text-xs",
        size === "md" && "h-8 px-3 text-[13px]",
        size === "lg" && "h-10 px-4 text-sm",
        variant === "primary" && "bg-safelight text-white shadow-[0_0_0_1px_rgba(255,90,54,.5),0_6px_20px_-6px_rgba(255,90,54,.6)] hover:bg-[#ff6a4a]",
        variant === "subtle" && "bg-ink-4 text-paper hover:bg-ink-5",
        variant === "ghost" && "text-mist hover:bg-ink-4 hover:text-paper",
        variant === "outline" && "border border-line text-mist hover:border-fog hover:text-paper",
        variant === "danger" && "bg-danger/15 text-[#ff8b8f] hover:bg-danger/25",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function IconButton({
  label,
  active,
  className,
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean }) {
  return (
    <button
      {...rest}
      title={label}
      aria-label={label}
      className={clsx(
        "inline-flex h-8 w-8 items-center justify-center rounded-md text-mist transition-colors duration-150 hover:bg-ink-4 hover:text-paper disabled:pointer-events-none disabled:opacity-35",
        active && "bg-ink-4 text-safelight",
        className,
      )}
    >
      {children}
    </button>
  );
}

/* Layout helpers ------------------------------------------------- */

export function Section({
  title,
  children,
  defaultOpen = true,
  right,
}: {
  title: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  right?: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-b border-line/70">
      <div className="flex h-9 items-center gap-2 px-3">
        <button className="flex flex-1 items-center gap-1.5 text-left text-[11px] font-semibold tracking-[0.12em] text-fog uppercase hover:text-mist" onClick={() => setOpen(!open)}>
          <ChevronDown size={13} className={clsx("transition-transform duration-150", !open && "-rotate-90")} />
          {title}
        </button>
        {right}
      </div>
      {open && <div className="space-y-2.5 px-3 pb-3.5">{children}</div>}
    </section>
  );
}

export function Field({ label, children, hint, inline = true }: { label: ReactNode; children: ReactNode; hint?: ReactNode; inline?: boolean }) {
  return (
    <label className={clsx("block", inline && "grid grid-cols-[76px_1fr] items-center gap-2")}>
      <span className={clsx("text-xs text-fog", !inline && "mb-1 block")}>{label}</span>
      <div className="min-w-0">
        {children}
        {hint && <div className="mt-1 text-[11px] leading-snug text-fog/80">{hint}</div>}
      </div>
    </label>
  );
}

const inputCls =
  "h-7 w-full rounded-md border border-line bg-ink-1 px-2 text-[13px] text-paper outline-none transition-colors placeholder:text-fog/60 hover:border-ink-5 focus:border-safelight/70";

export function TextInput({
  value,
  onChange,
  placeholder,
  className,
  onCommit,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  onCommit?: () => void;
}) {
  return (
    <input
      className={clsx(inputCls, className)}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onCommit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        e.stopPropagation();
      }}
    />
  );
}

export function TextArea({ value, onChange, rows = 3, placeholder }: { value: string; onChange: (v: string) => void; rows?: number; placeholder?: string }) {
  return (
    <textarea
      className={clsx(inputCls, "h-auto resize-y py-1.5 leading-relaxed")}
      rows={rows}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => e.stopPropagation()}
    />
  );
}

/** Number input with optional slider; commits while dragging (coalesced upstream). */
export function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
  slider = false,
  digits,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  slider?: boolean;
  digits?: number;
}) {
  const fmt = (v: number) => (digits !== undefined ? v.toFixed(digits) : String(Math.round(v * 1000) / 1000));
  const [text, setText] = useState(fmt(value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(fmt(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const clampV = (v: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v));
  const commit = () => {
    const v = Number(text);
    if (!Number.isNaN(v)) onChange(clampV(v));
    else setText(fmt(value));
  };
  return (
    <div className="flex items-center gap-2">
      {slider && min !== undefined && max !== undefined && (
        <input
          type="range"
          className="range min-w-0 flex-1"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      )}
      <div className={clsx("relative", slider ? "w-[68px] shrink-0" : "w-full")}>
        <input
          className={clsx(inputCls, "font-mono text-xs", unit && "pr-6")}
          value={text}
          inputMode="decimal"
          onFocus={() => (focused.current = true)}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => {
            focused.current = false;
            commit();
          }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "ArrowUp" || e.key === "ArrowDown") {
              e.preventDefault();
              const d = (e.key === "ArrowUp" ? 1 : -1) * step * (e.shiftKey ? 10 : 1);
              const v = clampV(Number(fmt(value + d)));
              onChange(v);
              setText(fmt(v));
            }
          }}
        />
        {unit && <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-[11px] text-fog">{unit}</span>}
      </div>
    </div>
  );
}

export function Select<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { id: T; label: string }[];
  className?: string;
}) {
  return (
    <div className={clsx("relative", className)}>
      <select
        className={clsx(inputCls, "cursor-pointer appearance-none pr-7")}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {options.map((o) => (
          <option key={o.id} value={o.id} className="bg-ink-2">
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown size={13} className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-fog" />
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = "md",
}: {
  value: T;
  onChange: (v: T) => void;
  options: { id: T; label: ReactNode; title?: string }[];
  size?: "sm" | "md";
}) {
  return (
    <div className="flex rounded-md border border-line bg-ink-1 p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          title={o.title}
          onClick={() => onChange(o.id)}
          className={clsx(
            "flex flex-1 items-center justify-center gap-1 rounded-[5px] transition-colors duration-150",
            size === "sm" ? "h-6 text-[11px]" : "h-[26px] text-xs",
            value === o.id ? "bg-ink-4 text-paper shadow-[inset_0_-1.5px_0_#FF5A36]" : "text-fog hover:text-mist",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="group flex max-w-full items-start gap-2 text-left text-xs leading-[18px] text-mist">
      <span className={clsx("relative mt-px h-[18px] w-8 shrink-0 rounded-full transition-colors duration-150", checked ? "bg-safelight" : "bg-ink-5")}>
        <span className={clsx("absolute top-[3px] h-3 w-3 rounded-full bg-paper transition-transform duration-150", checked ? "translate-x-[17px]" : "translate-x-[3px]")} />
      </span>
      {label}
    </button>
  );
}

export function ColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <label className="relative h-7 w-9 shrink-0 cursor-pointer overflow-hidden rounded-md border border-line" style={{ background: value }}>
        <input type="color" className="absolute inset-0 cursor-pointer opacity-0" value={value.slice(0, 7)} onChange={(e) => onChange(e.target.value.toUpperCase())} />
      </label>
      <input
        className={clsx(inputCls, "font-mono text-xs uppercase")}
        value={value}
        onChange={(e) => {
          const v = e.target.value;
          if (/^#[0-9a-fA-F]{0,6}$/.test(v)) onChange(v.toUpperCase());
        }}
        onKeyDown={(e) => e.stopPropagation()}
      />
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-line bg-ink-1 px-1.5 py-px font-mono text-[10px] text-mist">{children}</kbd>;
}

export function Empty({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      <div className="text-fog/70">{icon}</div>
      <div className="text-[13px] font-medium text-mist">{title}</div>
      {children && <div className="text-xs leading-relaxed text-fog">{children}</div>}
    </div>
  );
}
