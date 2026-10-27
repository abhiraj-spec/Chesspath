"use client";

import Link from "next/link";
import { useState } from "react";
import { Search } from "lucide-react";
import { GLOSSARY } from "@/content/glossary";
import { getLesson } from "@/content/lessons";
import { PageHeader } from "@/components/ui/primitives";

export function GlossaryView() {
  const [q, setQ] = useState("");
  const list = GLOSSARY.filter((g) => !q || g.term.toLowerCase().includes(q.toLowerCase()) || g.definition.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow="Reference" title="Glossary" description="Plain-language definitions of the chess terms used in ChessPath." />
      <div className="relative mb-5">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden />
        <label htmlFor="glossary-search" className="sr-only">
          Search terms
        </label>
        <input id="glossary-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search terms" className="h-11 w-full rounded-[var(--radius-md)] border border-border-strong bg-surface pl-9 pr-3" />
      </div>
      <p className="t-small mb-3 text-muted" aria-live="polite">
        {list.length} term{list.length === 1 ? "" : "s"}
      </p>
      <dl className="divide-y divide-border rounded-[var(--radius-lg)] border border-border bg-surface">
        {list.map((g) => {
          const lesson = g.lesson ? getLesson(g.lesson) : undefined;
          return (
            <div key={g.term} className="px-4 py-3" id={g.term.toLowerCase().replace(/\s+/g, "-")}>
              <dt className="t-card">{g.term}</dt>
              <dd className="t-small mt-0.5 text-muted">
                {g.definition}
                {lesson && (
                  <>
                    {" "}
                    <Link href={`/learn/${lesson.id}/`} className="text-accent underline-offset-2 hover:underline">
                      Lesson: {lesson.title}
                    </Link>
                  </>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}
