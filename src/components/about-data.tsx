"use client";

import { useState, useRef, useEffect } from "react";
import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { NotesSection } from "@/components/notes-section";

export interface AboutCard {
  title: string;
  body: ReactNode;
}

export function AboutData({ cards, source }: { cards: AboutCard[]; source: ReactNode }) {
  return (
    <NotesSection
      id="about-heading"
      title="About this data"
      notes={[
        ...cards.map((card) => ({ term: card.title, body: card.body })),
        { term: "Source and handling", body: source },
      ]}
    />
  );
}