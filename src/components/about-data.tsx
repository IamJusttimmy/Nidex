import type { ReactNode } from "react";

export interface AboutCard {
  title: string;
  body: ReactNode;
}

/**
 * The "About this data" block that every dataset page carries:
 * three short explainer cards and a source-and-handling note.
 */
export function AboutData({ cards, source }: { cards: AboutCard[]; source: ReactNode }) {
  return (
    <section aria-labelledby="about-heading" className="flex flex-col gap-4">
      <h2 id="about-heading" className="text-xl font-semibold tracking-tight">
        About this data
      </h2>
      <div className="grid gap-4 md:grid-cols-3">
        {cards.map((card) => (
          <div
            key={card.title}
            className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-5"
          >
            <h3 className="text-[15px] font-semibold">{card.title}</h3>
            <p className="text-[15px] leading-relaxed text-muted">{card.body}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-5">
        <h3 className="text-[15px] font-semibold">Source and handling</h3>
        <p className="text-sm leading-relaxed text-muted">{source}</p>
      </div>
    </section>
  );
}