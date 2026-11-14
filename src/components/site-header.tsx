"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { NAV_ITEMS } from "@/lib/nav";

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { setOpen(false); }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setOpen(false); buttonRef.current?.focus(); }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <>
      <header className="sticky top-0 z-40 bg-paper border-b border-line">
        <div className="mx-auto flex h-16 max-w-page items-center justify-between px-6">

          {/* Logo */}
          <Link
            href="/"
            className="flex items-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            aria-label="Nidex home"
          >
            <img
              src="/nidex.png"
              alt="Nidex"
              className="h-40 w-auto"
              //  style={{ filter: "brightness(0) saturate(0) contrast(1.2)" }}
              width={120}
              height={120}
            />
          </Link>

          {/* Desktop pill nav */}
          <nav
            aria-label="Main"
            className="hidden md:flex items-center gap-1 rounded-full border border-line bg-surface px-2 py-1.5 shadow-sm"
          >
            {NAV_ITEMS.map((item) => {
              const active =
                item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={[
                    "rounded-full px-4 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
                    active
                      ? "bg-brand text-white"
                      : "text-ink hover:bg-brand-soft hover:text-brand",
                  ].join(" ")}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* Mobile hamburger */}
          <button
            ref={buttonRef}
            type="button"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="mobile-nav"
            onClick={() => setOpen((v) => !v)}
            className="md:hidden flex flex-col justify-center gap-[5px] p-2 -mr-2 text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <span className={["block h-[2px] w-5 bg-current transition-transform duration-200 origin-center", open ? "translate-y-[7px] rotate-45" : ""].join(" ")} />
            <span className={["block h-[2px] w-5 bg-current transition-opacity duration-200", open ? "opacity-0" : ""].join(" ")} />
            <span className={["block h-[2px] w-5 bg-current transition-transform duration-200 origin-center", open ? "-translate-y-[7px] -rotate-45" : ""].join(" ")} />
          </button>
        </div>
      </header>

      {/* Mobile drawer */}
            {/* Mobile drawer — compact dropdown, no full-screen takeover */}
      {open && (
        <>
          {/* Invisible tap-away area */}
          <div
            aria-hidden
            className="md:hidden fixed inset-0 top-16 z-20"
            onClick={() => setOpen(false)}
          />

          <div
            id="mobile-nav"
            className="md:hidden fixed inset-x-4 top-[4.5rem] z-30 rounded-2xl border border-line bg-surface shadow-lg overflow-hidden"
          >
            <nav aria-label="Main mobile" className="flex flex-col p-2 gap-1">
              {NAV_ITEMS.map((item) => {
                const active =
                  item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setOpen(false)}
                    className={[
                      "rounded-xl px-4 py-3 text-[15px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
                      active
                        ? "bg-brand text-white"
                        : "text-ink hover:bg-brand-soft hover:text-brand",
                    ].join(" ")}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        </>
      )}
    </>
  );
}