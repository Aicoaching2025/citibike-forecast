"use client";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="rounded-2xl border border-bad/30 bg-bad/5 p-6">
      <h1 className="font-semibold text-bad">Something went wrong loading this page.</h1>
      <p className="mt-1 text-[14px] text-muted">The data warehouse may be starting up. Try again in a moment.</p>
      <button onClick={reset} className="mt-4 rounded-lg bg-accent px-4 py-2 text-[14px] font-medium text-white">Try again</button>
    </div>
  );
}
