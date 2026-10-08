"use client";

import { Loader2Icon, TriangleAlertIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { EmailEditor, type BodyFormat } from "@/components/email-editor/email-editor";
import { VariableMenu } from "@/components/email-editor/variable-menu";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { lintTemplate, looksLikeHtml, textToHtml } from "@/lib/email/template";
import { createTemplate, saveTemplate } from "./actions";

type Values = { name: string; subject: string; body: string; body_format: BodyFormat };

export function TemplateForm({
  id,
  initial,
  customKeys,
}: {
  // No id = a new template.
  id?: string;
  initial?: { name: string; subject: string; body: string; body_format: string };
  customKeys: string[];
}) {
  const router = useRouter();
  const [values, setValues] = useState<Values>(() => {
    const format: BodyFormat = initial?.body_format === "html" ? "html" : "rich";
    const body = initial?.body ?? "";
    return {
      name: initial?.name ?? "",
      subject: initial?.subject ?? "",
      body: format === "rich" && body && !looksLikeHtml(body) ? textToHtml(body) : body,
      body_format: format,
    };
  });
  const [saved, setSaved] = useState(() => JSON.stringify(values));
  const [nameError, setNameError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const subjectRef = useRef<HTMLInputElement>(null);

  const dirty = JSON.stringify(values) !== saved;
  const problems = [...lintTemplate(values.subject), ...lintTemplate(values.body)];

  function insertIntoSubject(name: string) {
    const el = subjectRef.current;
    const token = `{{${name}}}`;
    const start = el?.selectionStart ?? values.subject.length;
    const end = el?.selectionEnd ?? values.subject.length;
    setValues((v) => ({ ...v, subject: v.subject.slice(0, start) + token + v.subject.slice(end) }));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    setNameError(undefined);
    startTransition(async () => {
      const res = id ? await saveTemplate(id, values) : await createTemplate(values);
      if (res.ok) {
        toast.success(id ? "Template saved" : "Template created");
        setSaved(JSON.stringify(values));
        if (!id) router.push("/templates");
      } else if (res.fieldErrors?.name?.[0]) {
        setNameError(res.fieldErrors.name[0]);
      } else {
        toast.error(res.error ?? Object.values(res.fieldErrors ?? {})[0]?.[0] ?? "Check the template.");
      }
    });
  }

  return (
    <form onSubmit={save} className="grid max-w-4xl gap-4">
      <Card>
        <CardContent className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="template-name">Template name</Label>
            <Input
              id="template-name"
              placeholder="e.g. First touch: SaaS founders"
              maxLength={200}
              required
              aria-invalid={nameError ? true : undefined}
              value={values.name}
              onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
            />
            {nameError ? (
              <p className="text-xs text-destructive">{nameError}</p>
            ) : (
              <p className="text-xs text-muted-foreground">Only you see this name.</p>
            )}
          </div>

          <div className="grid gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="template-subject">Subject</Label>
              <VariableMenu customKeys={customKeys} onPick={insertIntoSubject} label="Variables" />
            </div>
            <Input
              id="template-subject"
              ref={subjectRef}
              placeholder="e.g. Quick question, {{firstName}}"
              maxLength={500}
              value={values.subject}
              onChange={(e) => setValues((v) => ({ ...v, subject: e.target.value }))}
            />
            <p className="text-xs text-muted-foreground">
              Leave empty for a follow-up that replies in the same thread.
            </p>
          </div>

          <EmailEditor
            id="template-body"
            value={values.body}
            format={values.body_format}
            customKeys={customKeys}
            placeholder="{Hi|Hello} {{firstName|there}}, I noticed {{company}} is growing fast…"
            onChange={(body, body_format) => setValues((v) => ({ ...v, body, body_format }))}
          />

          {problems.length > 0 && (
            <ul className="grid gap-1 text-xs text-destructive">
              {problems.map((p) => (
                <li key={p} className="flex items-center gap-1">
                  <TriangleAlertIcon className="size-3.5" />
                  {p}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-3">
        {dirty && id && <span className="text-xs text-muted-foreground">Unsaved changes</span>}
        <Button type="submit" disabled={pending || (Boolean(id) && !dirty)}>
          {pending && <Loader2Icon className="animate-spin" />}
          {id ? "Save template" : "Create template"}
        </Button>
      </div>
    </form>
  );
}
