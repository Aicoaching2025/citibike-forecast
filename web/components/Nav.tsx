"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const LINKS = [
  { href: "/", label: "Find a bike or dock", short: "Find" },
  { href: "/performance", label: "Model performance", short: "Performance" },
  { href: "/status", label: "System status", short: "Status" },
];

export function Nav() {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-panel/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span aria-hidden className="grid h-7 w-7 place-items-center rounded-lg bg-accent text-[13px] font-bold text-white">D</span>
          <span className="text-[16px]">DockCast</span>
        </Link>
        <nav aria-label="Main" className="-mx-1 flex max-w-full gap-1 overflow-x-auto">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={path === l.href ? "page" : undefined}
              className={clsx(
                "whitespace-nowrap rounded-lg px-3 py-1.5 text-[13.5px] font-medium transition",
                path === l.href ? "bg-accent/10 text-accent" : "text-muted hover:bg-line/50 hover:text-ink",
              )}
            >
              <span className="sm:hidden">{l.short}</span>
              <span className="hidden sm:inline">{l.label}</span>
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
