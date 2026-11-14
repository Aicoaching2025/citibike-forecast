const TZ = "America/New_York";

const timeFmt = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" });
const dayTimeFmt = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short", hour: "numeric", minute: "2-digit" });
const fullFmt = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export const fmtTime = (iso: string | number) => timeFmt.format(new Date(iso));
export const fmtDayTime = (iso: string | number) => dayTimeFmt.format(new Date(iso));
export const fmtFull = (iso: string | number) => fullFmt.format(new Date(iso));
export const plus15 = (iso: string) => new Date(Date.parse(iso) + 15 * 60_000).toISOString();

export const pct = (x: number | null | undefined, digits = 0) =>
  x === null || x === undefined || !Number.isFinite(x) ? "—" : `${(x * 100).toFixed(digits)}%`;

export function minutesAgo(iso: string | null | undefined, now = Date.now()): number | null {
  if (!iso) return null;
  return Math.max(0, (now - Date.parse(iso)) / 60_000);
}

export function ago(iso: string | null | undefined): string {
  const m = minutesAgo(iso);
  if (m === null) return "unknown";
  if (m < 1) return "just now";
  if (m < 60) return `${Math.round(m)} min ago`;
  return `${(m / 60).toFixed(1)} h ago`;
}
