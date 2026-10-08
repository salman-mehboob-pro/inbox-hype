"use client";

import { TriangleAlertIcon } from "lucide-react";
import { render, type TemplateLead, type TemplateSender } from "@/lib/email/template";

// Live preview of an email for one lead (variables + spin text filled in).
// Email HTML is shown in a sandboxed iframe (no scripts), so pasted HTML
// can't affect the app.
export function EmailPreview({
  subject,
  body,
  lead,
  sender,
  seed,
  title,
  emptySubject = "(empty)",
}: {
  subject: string;
  body: string;
  lead: TemplateLead | null;
  sender: TemplateSender;
  // Picks the spin-text options, like the real send does per lead + step.
  seed: string;
  title: string;
  emptySubject?: string;
}) {
  const sample: TemplateLead = lead ?? { email: "jane@example.com", first_name: "Jane", company: "Example Co" };
  const fullSeed = `${sample.email}:${seed}`;

  const renderedSubject = render(subject, sample, sender, `${fullSeed}:subject`);
  const renderedBody = render(body, sample, sender, `${fullSeed}:body`, { html: true });
  const missing = [...new Set([...renderedSubject.missing, ...renderedBody.missing])];

  const doc = `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>
    body{font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#111;margin:12px;}
    p{margin:0 0 .75em} img{max-width:100%;height:auto} blockquote{border-left:3px solid #ddd;margin:0 0 .75em;padding-left:.75em;color:#555}
  </style></head><body>${renderedBody.text}</body></html>`;

  return (
    <div className="grid gap-2 rounded-lg border bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground">
        Preview for <span className="font-medium text-foreground">{sample.email}</span>
        {!lead && " (sample lead: add leads to see a real one)"}
      </p>
      <p className="text-sm">
        <span className="text-muted-foreground">Subject: </span>
        <span className="font-medium">
          {renderedSubject.text || <em className="text-muted-foreground">{emptySubject}</em>}
        </span>
      </p>
      <iframe title={title} sandbox="allow-popups" srcDoc={doc} className="h-72 w-full rounded-md border bg-white" />
      {missing.length > 0 && (
        <p className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400">
          <TriangleAlertIcon className="size-3.5" />
          No value for {missing.map((m) => `{{${m}}}`).join(", ")} for this lead. Add a fallback like{" "}
          {`{{${missing[0]}|…}}`}.
        </p>
      )}
    </div>
  );
}
