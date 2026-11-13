"use client";

import { useState, useRef, useEffect } from "react";
import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export interface Note {
  term: string;
  body: ReactNode;
}

interface Props {
  id: string;
  title: string;
  intro?: string;
  notes: Note[];
}

function AnimatedDisclosure({ open, children }: { open: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | undefined>(open ? undefined : 0);

  useEffect(() => {
    if (!ref.current) return;
    if (open) {
      setHeight(ref.current.scrollHeight);
      // After transition, let it grow naturally (e.g. if content reflows)
      const id = setTimeout(() => setHeight(undefined), 250);
      return () => clearTimeout(id);
    } else {
      // Snap from auto to a fixed px before collapsing so the transition works
      setHeight(ref.current.scrollHeight);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setHeight(0));
      });
    }
  }, [open]);

  return (
    <div
      ref={ref}
      style={{ height: height === undefined ? "auto" : height }}
      className="overflow-hidden transition-[height] duration-200 ease-in-out"
    >
      {children}
    </div>
  );
}

export function NotesSection({ id, title, intro, notes }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <section aria-labelledby={id} className="border-t border-line pt-6">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`${id}-body`}
        onClick={() => setOpen((v) => !v)}
        className="group flex w-full items-center justify-between gap-4 text-left"
      >
        <span id={id} className="text-[15px] font-medium text-ink">
          {title}
        </span>
        <ChevronDown
          size={15}
          className={`shrink-0 text-muted transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      <AnimatedDisclosure open={open}>
        <div id={`${id}-body`}>
          {intro && (
            <p className="mt-3 text-[13px] leading-relaxed text-muted">{intro}</p>
          )}
          <dl className="mt-4 max-w-2xl">
            {notes.map((n) => (
              <div
                key={n.term}
                className="border-t border-line py-4 first:border-t-0 first:pt-0 last:pb-0"
              >
                <dt className="text-[15px] font-semibold">{n.term}</dt>
                <dd className="mt-1 text-[15px] leading-relaxed text-muted">{n.body}</dd>
              </div>
            ))}
          </dl>
        </div>
      </AnimatedDisclosure>
    </section>
  );
}