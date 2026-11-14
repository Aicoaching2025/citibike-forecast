export default function Loading() {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true" aria-label="Loading">
      <div className="h-8 w-80 rounded-lg bg-line/70" />
      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <div className="h-[460px] rounded-2xl bg-line/50" />
        <div className="h-[460px] rounded-2xl bg-line/50" />
      </div>
    </div>
  );
}
