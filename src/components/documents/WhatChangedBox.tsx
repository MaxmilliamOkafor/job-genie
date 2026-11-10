import { ListChecks } from 'lucide-react';
import { whatChangedLines } from '@/lib/whatChanged';

/**
 * Up to five plain lines saying what tailoring changed. The lines are shown
 * as text, never as HTML, and the box is hidden when there is nothing to say.
 */
export function WhatChangedBox({ lines }: { lines: unknown }) {
  const shown = whatChangedLines(lines);
  if (!shown.length) return null;
  return (
    <div className="rounded-md border border-border bg-muted/40 p-3" aria-label="What changed">
      <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <ListChecks className="h-3.5 w-3.5" /> What changed
      </p>
      <ul className="space-y-1 text-sm text-foreground">
        {shown.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>
    </div>
  );
}
