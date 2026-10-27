import { Fragment } from "react";

/** Minimal formatter for lesson text: supports **bold** only. Content is static and trusted. */
export function RichText({ text, className }: { text: string; className?: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <p className={className}>
      {parts.map((p, i) =>
        p.startsWith("**") && p.endsWith("**") ? (
          <strong key={i} className="font-semibold text-fg">
            {p.slice(2, -2)}
          </strong>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </p>
  );
}

export function RichParagraphs({ paragraphs, className }: { paragraphs: string[]; className?: string }) {
  return (
    <div className={className}>
      {paragraphs.map((t, i) => (
        <RichText key={i} text={t} className={i > 0 ? "mt-2.5" : undefined} />
      ))}
    </div>
  );
}
