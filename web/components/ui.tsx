import clsx from "clsx";
import type { ReactNode } from "react";

export function Card({ title, subtitle, children, className, action }: { title?: ReactNode; subtitle?: ReactNode; children: ReactNode; className?: string; action?: ReactNode }) {
  return (
    <section className={clsx("rounded-2xl border border-line bg-panel shadow-card", className)}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-4 px-5 pt-4">
          <div>
            {title && <h2 className="text-[15px] font-semibold text-ink">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "good" | "warn" | "bad" }) {
  return (
    <div className="rounded-2xl border border-line bg-panel p-4 shadow-card">
      <div className="text-[12.5px] text-muted">{label}</div>
      <div className={clsx("mt-1 text-2xl font-semibold tabular-nums", tone === "good" && "text-good", tone === "warn" && "text-warn", tone === "bad" && "text-bad")}>
        {value}
      </div>
      {sub && <div className="mt-1 text-[12.5px] text-muted">{sub}</div>}
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-xl border border-line bg-surface p-1">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={clsx(
            "rounded-lg px-3.5 py-1.5 text-[13.5px] font-medium transition",
            value === o.value ? "bg-panel text-ink shadow-card" : "text-muted hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Pill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "good" | "warn" | "bad" | "accent" }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px] font-medium",
        tone === "neutral" && "bg-line/60 text-muted",
        tone === "good" && "bg-good/10 text-good",
        tone === "warn" && "bg-warn/15 text-warn",
        tone === "bad" && "bg-bad/10 text-bad",
        tone === "accent" && "bg-accent/10 text-accent",
      )}
    >
      {children}
    </span>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-bad/30 bg-bad/5 p-6 text-[14px]">
      <div className="font-semibold text-bad">Data is temporarily unavailable</div>
      <p className="mt-1 text-muted">{message}</p>
    </div>
  );
}

export function DemoBanner() {
  return (
    <div className="mb-5 rounded-xl border border-warn/40 bg-warn/10 px-4 py-2.5 text-[13px] text-ink">
      <strong>Demo mode.</strong> Synthetic stations and data, for preview only. Connect Databricks to show live forecasts.
    </div>
  );
}
