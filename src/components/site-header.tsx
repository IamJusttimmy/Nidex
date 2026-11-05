"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "@/lib/nav";

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="bg-brand">
      <div className="mx-auto flex min-h-16 max-w-page flex-wrap items-center gap-x-8 px-6">
        <Link
          href="/"
          className="text-[22px] font-bold tracking-tight text-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-paper"
        >
          nidex
        </Link>
        <nav aria-label="Main" className="flex flex-wrap gap-1">
          {NAV_ITEMS.map((item) => {
            const active =
              item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={[
                  "border-b-2 px-3 pt-5.5 pb-5 text-[15px] font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-paper",
                  active
                    ? "border-paper text-white"
                    : "border-transparent text-brand-mute hover:text-white",
                ].join(" ")}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}