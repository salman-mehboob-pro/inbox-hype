"use client";

import { BracesIcon, Loader2Icon, PencilIcon, PlusIcon, XIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { customFieldKey, LIMITS } from "@/lib/leads/import";
import { updateLeadCustomFields } from "../actions";

// "company_size" -> "Company Size"
const humanize = (key: string) => key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

type Row = { key: string; value: string };

export function CustomFieldsCard({ id, initial }: { id: string; initial: Record<string, string> }) {
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const entries = Object.entries(initial);

  function startEdit() {
    setRows(entries.map(([key, value]) => ({ key, value })));
    setError(undefined);
    setEditing(true);
  }

  function save() {
    const fields: Record<string, string> = {};
    for (const r of rows) {
      const key = customFieldKey(r.key);
      if (!r.key.trim() && !r.value.trim()) continue; // empty row
      if (!key) return setError("Every field needs a name.");
      if (key in fields) return setError(`The field "${key}" is used twice.`);
      if (r.value.trim()) fields[key] = r.value.trim();
    }
    startTransition(async () => {
      const res = await updateLeadCustomFields(id, fields);
      if (res.ok) {
        toast.success("Custom fields saved");
        setEditing(false);
      } else setError(res.error);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BracesIcon className="size-4 text-primary" />
          Custom fields
          <Badge variant="secondary">{entries.length}</Badge>
        </CardTitle>
        {!editing && (
          <CardAction>
            <Button variant="outline" size="sm" onClick={startEdit}>
              <PencilIcon />
              Edit
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {editing ? (
          <div className="grid gap-3">
            {rows.map((r, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  aria-label="Field name"
                  placeholder="field_name"
                  className="w-40 font-mono text-xs"
                  value={r.key}
                  onChange={(e) => setRows((prev) => prev.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))}
                />
                <Input
                  aria-label={`Value for ${r.key || "field"}`}
                  placeholder="Value"
                  maxLength={LIMITS.maxValueLength}
                  value={r.value}
                  onChange={(e) =>
                    setRows((prev) => prev.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))
                  }
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${r.key || "field"}`}
                  onClick={() => setRows((prev) => prev.filter((_, j) => j !== i))}
                >
                  <XIcon />
                </Button>
              </div>
            ))}
            {rows.length < LIMITS.maxCustomFields && (
              <Button
                variant="outline"
                size="sm"
                className="justify-self-start"
                onClick={() => setRows((prev) => [...prev, { key: "", value: "" }])}
              >
                <PlusIcon />
                Add field
              </Button>
            )}
            <p className="text-xs text-muted-foreground">
              Names become variables in emails, e.g. <code className="font-mono">company_size</code> →{" "}
              <code className="font-mono">{"{{company_size}}"}</code>. Empty values are removed.
            </p>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <div className="flex gap-2">
              <Button onClick={save} disabled={pending}>
                {pending && <Loader2Icon className="animate-spin" />}
                Save
              </Button>
              <Button variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No custom fields yet.</p>
        ) : (
          <dl className="divide-y">
            {entries.map(([key, value]) => (
              <div key={key} className="grid gap-0.5 py-3 first:pt-0 last:pb-0">
                <dt className="flex items-center gap-2 text-xs text-muted-foreground">
                  {humanize(key)}
                  <code className="font-mono text-[11px] opacity-70">{`{{${key}}}`}</code>
                </dt>
                <dd className="text-sm break-words">{value}</dd>
              </div>
            ))}
          </dl>
        )}
      </CardContent>
    </Card>
  );
}
