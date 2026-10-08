"use client";

import {
  ArrowDownIcon,
  ArrowUpIcon,
  ClockIcon,
  EyeIcon,
  EyeOffIcon,
  Loader2Icon,
  PlusIcon,
  Trash2Icon,
  TriangleAlertIcon,
} from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { EmailEditor, type BodyFormat } from "@/components/email-editor/email-editor";
import { EmailPreview } from "@/components/email-editor/email-preview";
import { VariableMenu } from "@/components/email-editor/variable-menu";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  lintTemplate,
  looksLikeHtml,
  textToHtml,
  type TemplateLead,
  type TemplateSender,
} from "@/lib/email/template";
import type { TemplateOption } from "../../templates/schema";
import { saveSequence } from "../actions";
import { MAX_STEPS } from "../schema";
import { StepTemplateMenu } from "./step-template-menu";

type Step = {
  key: string;
  id?: string;
  delay_days: number;
  delay_hours: number;
  subject: string;
  body: string;
  body_format: BodyFormat;
};

let keySeq = 0;
const newKey = () => `new-${++keySeq}`;

type InitialStep = {
  id: string;
  position: number;
  delay_days: number;
  delay_hours: number;
  subject: string;
  body: string;
  body_format: string;
};

// Bodies saved before the rich editor were plain text.
function normalizeBody(body: string, bodyFormat: string): { body: string; body_format: BodyFormat } {
  const format: BodyFormat = bodyFormat === "html" ? "html" : "rich";
  return { body: format === "rich" && body && !looksLikeHtml(body) ? textToHtml(body) : body, body_format: format };
}

function toState(rows: InitialStep[]): Step[] {
  return rows.map((s) => {
    const { body, body_format: format } = normalizeBody(s.body, s.body_format);
    return {
      key: s.id,
      id: s.id,
      delay_days: s.delay_days,
      delay_hours: s.delay_hours,
      subject: s.subject,
      body,
      body_format: format,
    };
  });
}

export function SequenceEditor({
  campaignId,
  initialSteps,
  customKeys,
  previewLead,
  sender,
  initialTemplates,
}: {
  campaignId: string;
  initialSteps: InitialStep[];
  customKeys: string[];
  previewLead: TemplateLead | null;
  sender: TemplateSender;
  initialTemplates: TemplateOption[];
}) {
  const [steps, setSteps] = useState<Step[]>(() => toState(initialSteps));
  const [templates, setTemplates] = useState(initialTemplates);
  const [saved, setSaved] = useState(() => JSON.stringify(toState(initialSteps)));
  const [previewing, setPreviewing] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const subjectRefs = useRef(new Map<string, HTMLInputElement>());

  const dirty = JSON.stringify(steps) !== saved;

  const update = (key: string, patch: Partial<Step>) =>
    setSteps((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)));

  function move(index: number, dir: -1 | 1) {
    setSteps((prev) => {
      const next = [...prev];
      const [s] = next.splice(index, 1);
      next.splice(index + dir, 0, s);
      return next;
    });
  }

  function insertIntoSubject(step: Step, name: string) {
    const el = subjectRefs.current.get(step.key);
    const token = `{{${name}}}`;
    const start = el?.selectionStart ?? step.subject.length;
    const end = el?.selectionEnd ?? step.subject.length;
    update(step.key, { subject: step.subject.slice(0, start) + token + step.subject.slice(end) });
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  }

  function save() {
    startTransition(async () => {
      const payload = steps.map((s, i) => ({
        id: s.id,
        delay_days: i === 0 ? 0 : s.delay_days,
        delay_hours: i === 0 ? 0 : s.delay_hours,
        subject: s.subject,
        body: s.body,
        body_format: s.body_format,
      }));
      const res = await saveSequence(campaignId, payload);
      if (res.ok) {
        toast.success("Sequence saved");
        // Link new steps to their saved rows (keys stay the same so the
        // editors don't remount).
        const ids = res.stepIds ?? [];
        const next = steps.map((s, i) => ({
          ...s,
          id: ids[i] ?? s.id,
          delay_days: i === 0 ? 0 : s.delay_days,
          delay_hours: i === 0 ? 0 : s.delay_hours,
        }));
        setSteps(next);
        setSaved(JSON.stringify(next));
      } else toast.error(res.error);
    });
  }

  const firstSubject = steps[0]?.subject ?? "";

  return (
    <div className="grid max-w-4xl gap-4">
      <div className="rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        Use variables like <code className="font-mono">{"{{firstName|there}}"}</code> (text after | is used when the
        value is empty) and spin text like <code className="font-mono">{"{Hi|Hello|Hey}"}</code> (one option is picked
        per lead). The inbox signature is added at the end. The sequence stops when the lead replies.
      </div>

      {steps.map((step, i) => {
        const problems = [...lintTemplate(step.subject), ...lintTemplate(step.body)];
        const isPreview = previewing.has(step.key);
        return (
          <div key={step.key} className="grid gap-2">
            {i > 0 && (
              <div className="flex items-center gap-2 pl-2 text-sm text-muted-foreground">
                <ClockIcon className="size-4" />
                Wait
                <Input
                  aria-label={`Days to wait before step ${i + 1}`}
                  type="number"
                  min={0}
                  max={365}
                  className="h-7 w-16 text-center"
                  value={step.delay_days}
                  onChange={(e) =>
                    update(step.key, { delay_days: Math.max(0, Math.min(365, Math.trunc(Number(e.target.value)) || 0)) })
                  }
                />
                {step.delay_days === 1 ? "day" : "days"}
                <Input
                  aria-label={`Hours to wait before step ${i + 1}`}
                  type="number"
                  min={0}
                  max={23}
                  className="h-7 w-16 text-center"
                  value={step.delay_hours}
                  onChange={(e) =>
                    update(step.key, { delay_hours: Math.max(0, Math.min(23, Math.trunc(Number(e.target.value)) || 0)) })
                  }
                />
                {step.delay_hours === 1 ? "hour" : "hours"} after step {i}, then send:
              </div>
            )}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Step {i + 1}
                  {i === 0 && <span className="ml-2 text-xs font-normal text-muted-foreground">sends first</span>}
                </CardTitle>
                <CardAction className="flex items-center gap-1">
                  <StepTemplateMenu
                    stepNumber={i + 1}
                    step={{ subject: step.subject, body: step.body, body_format: step.body_format }}
                    templates={templates}
                    onApply={(t) => update(step.key, { subject: t.subject, ...normalizeBody(t.body, t.body_format) })}
                    onSaved={(t) =>
                      setTemplates((prev) => [...prev, t].sort((a, b) => a.name.localeCompare(b.name)))
                    }
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={isPreview ? `Hide preview of step ${i + 1}` : `Preview step ${i + 1}`}
                    onClick={() =>
                      setPreviewing((prev) => {
                        const next = new Set(prev);
                        if (next.has(step.key)) next.delete(step.key);
                        else next.add(step.key);
                        return next;
                      })
                    }
                  >
                    {isPreview ? <EyeOffIcon /> : <EyeIcon />}
                    Preview
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Move step ${i + 1} up`}
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                  >
                    <ArrowUpIcon />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Move step ${i + 1} down`}
                    disabled={i === steps.length - 1}
                    onClick={() => move(i, 1)}
                  >
                    <ArrowDownIcon />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Delete step ${i + 1}`}
                    disabled={steps.length === 1}
                    onClick={() => setSteps((prev) => prev.filter((s) => s.key !== step.key))}
                  >
                    <Trash2Icon />
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor={`${step.key}-subject`}>Subject</Label>
                    <VariableMenu customKeys={customKeys} onPick={(n) => insertIntoSubject(step, n)} label="Variables" />
                  </div>
                  <Input
                    id={`${step.key}-subject`}
                    ref={(el) => {
                      if (el) subjectRefs.current.set(step.key, el);
                    }}
                    placeholder={
                      i === 0 ? "e.g. Quick question, {{firstName}}" : "Leave empty to reply in the same thread"
                    }
                    maxLength={500}
                    value={step.subject}
                    onChange={(e) => update(step.key, { subject: e.target.value })}
                  />
                  {i > 0 && !step.subject.trim() && (
                    <p className="text-xs text-muted-foreground">
                      Sent as a reply: &quot;Re: {firstSubject || "step 1 subject"}&quot;
                    </p>
                  )}
                </div>

                <EmailEditor
                  id={`${step.key}-body`}
                  value={step.body}
                  format={step.body_format}
                  customKeys={customKeys}
                  placeholder={
                    i === 0
                      ? "{Hi|Hello} {{firstName|there}}, I noticed {{company}} is growing fast…"
                      : "Just following up on my last email…"
                  }
                  onChange={(body, body_format) => update(step.key, { body, body_format })}
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
                {isPreview && (
                  <EmailPreview
                    subject={step.subject.trim() || (i > 0 ? `Re: ${firstSubject}` : "")}
                    body={step.body}
                    lead={previewLead}
                    sender={sender}
                    seed={String(i + 1)}
                    title={`Preview of step ${i + 1}`}
                  />
                )}
              </CardContent>
            </Card>
          </div>
        );
      })}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          variant="outline"
          disabled={steps.length >= MAX_STEPS}
          onClick={() =>
            setSteps((prev) => [
              ...prev,
              { key: newKey(), delay_days: 3, delay_hours: 0, subject: "", body: "", body_format: "rich" },
            ])
          }
        >
          <PlusIcon />
          Add follow-up
        </Button>
        <div className="flex items-center gap-3">
          {dirty && <span className="text-xs text-muted-foreground">Unsaved changes</span>}
          <Button onClick={save} disabled={pending || !dirty}>
            {pending && <Loader2Icon className="animate-spin" />}
            Save sequence
          </Button>
        </div>
      </div>
    </div>
  );
}
