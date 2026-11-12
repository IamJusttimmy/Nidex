"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { NAV_ITEMS } from "@/lib/nav";

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close on route change
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  // Trap scroll behind drawer
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <>
      <header className="bg-brand relative z-40">
        <div className="mx-auto flex min-h-16 max-w-page items-center justify-between px-6 md:justify-start md:gap-x-8">
          <Link
            href="/"
            className="text-[22px] font-bold tracking-tight text-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-paper"
          >
            nidex
          </Link>

          {/* Desktop nav */}
          <nav aria-label="Main" className="hidden md:flex flex-wrap gap-1">
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

          {/* Hamburger button — mobile only */}
          <button
            ref={buttonRef}
            type="button"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="mobile-nav"
            onClick={() => setOpen((v) => !v)}
            className="md:hidden flex flex-col justify-center gap-[5px] p-2 -mr-2 text-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-paper"
          >
            <span
              className={[
                "block h-[2px] w-5 bg-current transition-transform duration-200 origin-center",
                open ? "translate-y-[7px] rotate-45" : "",
              ].join(" ")}
            />
            <span
              className={[
                "block h-[2px] w-5 bg-current transition-opacity duration-200",
                open ? "opacity-0" : "",
              ].join(" ")}
            />
            <span
              className={[
                "block h-[2px] w-5 bg-current transition-transform duration-200 origin-center",
                open ? "-translate-y-[7px] -rotate-45" : "",
              ].join(" ")}
            />
          </button>
        </div>
      </header>

      {/* Mobile drawer */}
      <div
        id="mobile-nav"
        ref={drawerRef}
        aria-hidden={!open}
        className={[
          "md:hidden fixed inset-x-0 top-16 z-30 bg-brand transition-all duration-200",
          open ? "opacity-100 translate-y-0 pointer-events-auto" : "opacity-0 -translate-y-2 pointer-events-none",
        ].join(" ")}
      >
        <nav aria-label="Main mobile">
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
                  "flex items-center border-l-4 px-6 py-4 text-[15px] font-medium focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-paper",
                  active
                    ? "border-paper text-white bg-black/10"
                    : "border-transparent text-brand-mute hover:text-white hover:bg-black/5",
                ].join(" ")}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Backdrop — tapping outside closes the drawer */}
        <div
          aria-hidden
          className="h-screen bg-black/40"
          onClick={() => setOpen(false)}
        />
      </div>
    </>
  );
}