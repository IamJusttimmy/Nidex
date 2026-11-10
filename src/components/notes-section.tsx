import type { ReactNode } from "react";

export interface Note {
  /** A few words that name the point, so the section can be scanned by its terms alone. */
  term: string;
  body: ReactNode;
}

interface Props {
  id: string;
  title: string;
  /** One short line under the title (optional). */
  intro?: string;
  notes: Note[];
}

/**
 * Reference notes for a dataset page: the title sits in a left column and the notes run down the right,
 * separated by thin rules. No boxes, fills or shadows, so it reads like the margin of a printed table
 * rather than a set of dashboard cards. On a phone the title simply sits above the notes.
 */
export function NotesSection({ id, title, intro, notes }: Props) {
  return (
    <section
      aria-labelledby={id}
      className="grid gap-x-12 gap-y-5 border-t border-line pt-8 lg:grid-cols-[15rem_minmax(0,1fr)]"
    >
      <div className="flex flex-col gap-2">
        <h2 id={id} className="text-xl font-semibold tracking-tight">
          {title}
        </h2>
        {intro && <p className="text-[13px] leading-relaxed text-muted">{intro}</p>}
      </div>
      <dl className="max-w-2xl">
        {notes.map((n) => (
          <div key={n.term} className="border-t border-line py-4 first:border-t-0 first:pt-0 last:pb-0">
            <dt className="text-[15px] font-semibold">{n.term}</dt>
            <dd className="mt-1 text-[15px] leading-relaxed text-muted">{n.body}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
