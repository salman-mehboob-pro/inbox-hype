"use client";

import { CheckCircle2Icon, FileUpIcon, Loader2Icon, TriangleAlertIcon } from "lucide-react";
import Link from "next/link";
import Papa from "papaparse";
import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  buildLeads,
  customFieldKey,
  guessMapping,
  LEAD_FIELDS,
  LIMITS,
  parseTags,
  validateMapping,
  type ColumnMapping,
  type ColumnTarget,
} from "@/lib/leads/import";
import { cn } from "@/lib/utils";
import { finishImport, importLeadsChunk } from "../actions";
import { IMPORT_CHUNK_SIZE } from "../schema";

type Step = "upload" | "map" | "review" | "importing" | "done";
type Parsed = { fileName: string; headers: string[]; rows: string[][] };
type Totals = { inserted: number; updated: number; skipped: number };

const MAX_FILE_BYTES = 10 * 1024 * 1024;

const TARGET_ITEMS: { value: ColumnTarget; label: string }[] = [
  ...LEAD_FIELDS.map((f) => ({ value: f.key as ColumnTarget, label: f.label })),
  { value: "custom", label: "Custom field" },
  { value: "skip", label: "Don't import" },
];

const STEPS: { key: Step; label: string }[] = [
  { key: "upload", label: "Upload" },
  { key: "map", label: "Match columns" },
  { key: "review", label: "Review" },
  { key: "done", label: "Import" },
];

export function ImportWizard() {
  const [step, setStep] = useState<Step>("upload");
  const [parsed, setParsed] = useState<Parsed>();
  const [mapping, setMapping] = useState<ColumnMapping[]>([]);
  const [uploadError, setUploadError] = useState<string>();
  const [extraTags, setExtraTags] = useState("");
  const [updateExisting, setUpdateExisting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [totals, setTotals] = useState<Totals>({ inserted: 0, updated: 0, skipped: 0 });
  const [importError, setImportError] = useState<string>();

  const mappingError = mapping.length ? validateMapping(mapping) : null;
  const result = useMemo(
    () => (parsed && step !== "upload" && !mappingError ? buildLeads(parsed.rows, mapping, parseTags(extraTags)) : null),
    [parsed, mapping, extraTags, step, mappingError],
  );

  function onFile(file: File | undefined) {
    setUploadError(undefined);
    if (!file) return;
    if (!/\.csv$/i.test(file.name) && file.type !== "text/csv") {
      setUploadError("Please choose a .csv file.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setUploadError("The file is larger than 10 MB. Split it into smaller files.");
      return;
    }
    Papa.parse<string[]>(file, {
      skipEmptyLines: "greedy",
      complete: (res) => {
        const [headerRow, ...rows] = res.data;
        const headers = (headerRow ?? []).map((h) => String(h ?? "").trim());
        if (!headers.length || headers.every((h) => !h)) {
          setUploadError("The file has no header row. The first row must have column names.");
          return;
        }
        if (!rows.length) {
          setUploadError("The file has no leads (only a header row).");
          return;
        }
        if (rows.length > LIMITS.maxRows) {
          setUploadError(`The file has ${rows.length.toLocaleString()} rows. The limit is ${LIMITS.maxRows.toLocaleString()} per import.`);
          return;
        }
        setParsed({ fileName: file.name, headers, rows });
        setMapping(guessMapping(headers));
        setStep("map");
      },
      error: () => setUploadError("Could not read the file. Is it a valid CSV?"),
    });
  }

  async function runImport() {
    if (!result) return;
    setStep("importing");
    setImportError(undefined);
    setProgress(0);
    const sum: Totals = { inserted: 0, updated: 0, skipped: 0 };
    setTotals(sum);

    try {
      for (let i = 0; i < result.leads.length; i += IMPORT_CHUNK_SIZE) {
        const chunk = result.leads.slice(i, i + IMPORT_CHUNK_SIZE);
        const res = await importLeadsChunk({ rows: chunk, updateExisting });
        if (!res.ok) {
          setImportError(res.error);
          break;
        }
        sum.inserted += res.inserted;
        sum.updated += res.updated;
        sum.skipped += res.skipped;
        setTotals({ ...sum });
        setProgress(Math.min(i + chunk.length, result.leads.length));
      }
    } catch {
      setImportError("Connection problem during the import.");
    }

    await finishImport().catch(() => {});
    setStep("done");
  }

  function reset() {
    setStep("upload");
    setParsed(undefined);
    setMapping([]);
    setExtraTags("");
    setUpdateExisting(false);
    setImportError(undefined);
  }

  // When finished, every step shows as complete.
  const activeIndex =
    step === "done" && !importError
      ? STEPS.length
      : STEPS.findIndex((s) => s.key === (step === "importing" ? "done" : step));

  return (
    <div className="grid max-w-4xl gap-6">
      <ol className="flex flex-wrap items-center gap-2 text-sm">
        {STEPS.map((s, i) => (
          <li key={s.key} className="flex items-center gap-2">
            <span
              className={cn(
                "flex size-6 items-center justify-center rounded-full border text-xs",
                i < activeIndex && "border-primary bg-primary text-primary-foreground",
                i === activeIndex && "border-primary text-primary",
                i > activeIndex && "text-muted-foreground",
              )}
            >
              {i + 1}
            </span>
            <span className={cn(i === activeIndex ? "font-medium" : "text-muted-foreground")}>{s.label}</span>
            {i < STEPS.length - 1 && <span className="mx-1 h-px w-6 bg-border" />}
          </li>
        ))}
      </ol>

      {step === "upload" && <UploadStep onFile={onFile} error={uploadError} />}

      {step === "map" && parsed && (
        <Card>
          <CardHeader>
            <CardTitle>Match columns</CardTitle>
            <CardDescription>
              {parsed.fileName} · {parsed.rows.length.toLocaleString()} rows. Tell us what each column is. Unknown
              columns become custom fields you can use in emails, like {"{{city}}"}.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Column in file</TableHead>
                    <TableHead className="hidden md:table-cell">Example</TableHead>
                    <TableHead>Import as</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsed.headers.map((header, col) => {
                    const example = parsed.rows.find((r) => r[col]?.trim())?.[col] ?? "";
                    const m = mapping[col];
                    return (
                      <TableRow key={col}>
                        <TableCell className="font-medium">{header || <em>(no name)</em>}</TableCell>
                        <TableCell className="hidden max-w-56 truncate text-muted-foreground md:table-cell">
                          {example}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-2">
                            <Select
                              items={TARGET_ITEMS}
                              value={m.target}
                              onValueChange={(v) =>
                                setMapping((prev) =>
                                  prev.map((x, i) =>
                                    i === col
                                      ? {
                                          target: v as ColumnTarget,
                                          customKey: v === "custom" ? x.customKey || customFieldKey(header) || `field_${col + 1}` : "",
                                        }
                                      : x,
                                  ),
                                )
                              }
                            >
                              <SelectTrigger className="w-56" aria-label={`Import ${header} as`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {TARGET_ITEMS.map((item) => (
                                  <SelectItem key={item.value} value={item.value}>
                                    {item.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {m.target === "custom" && (
                              <Input
                                className="w-44 font-mono text-xs"
                                aria-label={`Custom field name for ${header}`}
                                value={m.customKey}
                                onChange={(e) =>
                                  setMapping((prev) =>
                                    prev.map((x, i) =>
                                      i === col ? { ...x, customKey: e.target.value.toLowerCase().replace(/\s+/g, "_") } : x,
                                    ),
                                  )
                                }
                              />
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            {mappingError && (
              <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {mappingError}
              </p>
            )}
          </CardContent>
          <CardFooter className="justify-between gap-2">
            <Button variant="ghost" onClick={reset}>
              Choose another file
            </Button>
            <Button disabled={Boolean(mappingError)} onClick={() => setStep("review")}>
              Next: review
            </Button>
          </CardFooter>
        </Card>
      )}

      {step === "review" && parsed && result && (
        <Card>
          <CardHeader>
            <CardTitle>Review</CardTitle>
            <CardDescription>Check the numbers before importing.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6">
            <div className="grid gap-3 sm:grid-cols-4">
              <Stat label="Ready to import" value={result.leads.length} tone="good" />
              <Stat label="Invalid / missing email" value={result.invalid.length} tone={result.invalid.length ? "bad" : undefined} />
              <Stat label="Duplicates in file" value={result.duplicatesInFile} />
              <Stat label="Unknown timezones" value={result.invalidTimezones} />
            </div>

            {result.invalid.length > 0 && (
              <details className="rounded-lg border p-3 text-sm">
                <summary className="cursor-pointer font-medium">
                  Rows that will be skipped ({result.invalid.length})
                </summary>
                <ul className="mt-2 grid max-h-48 gap-1 overflow-y-auto text-muted-foreground">
                  {result.invalid.slice(0, 200).map((r) => (
                    <li key={r.rowNumber}>
                      Line {r.rowNumber}: {r.reason}
                      {r.value && <span className="font-mono"> ({r.value})</span>}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            <div className="grid gap-1.5">
              <Label htmlFor="extraTags">Add tags to all imported leads (optional)</Label>
              <Input
                id="extraTags"
                placeholder="e.g. october-list, saas"
                value={extraTags}
                onChange={(e) => setExtraTags(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Separate tags with commas.</p>
            </div>

            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-medium">If a lead already exists (same email)</legend>
              <RadioOption
                checked={!updateExisting}
                onChange={() => setUpdateExisting(false)}
                title="Skip it"
                description="Keep the existing lead as it is."
              />
              <RadioOption
                checked={updateExisting}
                onChange={() => setUpdateExisting(true)}
                title="Update it"
                description="Fill in new values from the file, merge tags and custom fields."
              />
            </fieldset>

            {result.leads.length > 0 && (
              <div className="grid gap-2">
                <p className="text-sm font-medium">Preview (first 5)</p>
                <div className="overflow-x-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Email</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Company</TableHead>
                        <TableHead>Tags</TableHead>
                        <TableHead>Custom fields</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.leads.slice(0, 5).map((l) => (
                        <TableRow key={l.email}>
                          <TableCell>{l.email}</TableCell>
                          <TableCell>{[l.first_name, l.last_name].filter(Boolean).join(" ")}</TableCell>
                          <TableCell>{l.company}</TableCell>
                          <TableCell>{l.tags.join(", ")}</TableCell>
                          <TableCell className="max-w-64 truncate font-mono text-xs">
                            {Object.entries(l.custom_fields)
                              .map(([k, v]) => `${k}: ${v}`)
                              .join(" · ")}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </CardContent>
          <CardFooter className="justify-between gap-2">
            <Button variant="ghost" onClick={() => setStep("map")}>
              Back
            </Button>
            <Button disabled={result.leads.length === 0} onClick={runImport}>
              Import {result.leads.length.toLocaleString()} leads
            </Button>
          </CardFooter>
        </Card>
      )}

      {(step === "importing" || step === "done") && result && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {step === "importing" ? (
                <>
                  <Loader2Icon className="size-4 animate-spin" /> Importing…
                </>
              ) : importError ? (
                <>
                  <TriangleAlertIcon className="size-4 text-destructive" /> Import stopped
                </>
              ) : (
                <>
                  <CheckCircle2Icon className="size-4 text-emerald-600" /> Import finished
                </>
              )}
            </CardTitle>
            <CardDescription>
              {progress.toLocaleString()} of {result.leads.length.toLocaleString()} leads processed
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div
              className="h-2 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={result.leads.length}
              aria-valuenow={progress}
            >
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${result.leads.length ? (progress / result.leads.length) * 100 : 0}%` }}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Stat label="New leads" value={totals.inserted} tone="good" />
              <Stat label="Updated" value={totals.updated} />
              <Stat label="Skipped (already existed)" value={totals.skipped} />
            </div>
            {importError && (
              <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {importError} Leads imported before the error were saved. You can run the import again with
                &quot;Skip it&quot; to add the rest.
              </p>
            )}
          </CardContent>
          {step === "done" && (
            <CardFooter className="gap-2">
              <Button nativeButton={false} render={<Link href="/leads" />}>
                View leads
              </Button>
              <Button variant="ghost" onClick={reset}>
                Import another file
              </Button>
            </CardFooter>
          )}
        </Card>
      )}
    </div>
  );
}

function UploadStep({ onFile, error }: { onFile: (f: File | undefined) => void; error?: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload a CSV file</CardTitle>
        <CardDescription>
          First row = column names. One column must be the email address. Up to {LIMITS.maxRows.toLocaleString()} rows,
          10 MB.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            onFile(e.dataTransfer.files[0]);
          }}
          className={cn(
            "flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-10 text-center transition-colors hover:bg-muted/50",
            dragging && "border-primary bg-primary/5",
          )}
        >
          <FileUpIcon className="size-8 text-muted-foreground" />
          <span className="font-medium">Drop your CSV here, or click to choose</span>
          <span className="text-xs text-muted-foreground">Exports from Apollo, Google Sheets or Excel work.</span>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          aria-label="Choose CSV file"
          onChange={(e) => {
            onFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        {error && (
          <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "text-xl font-semibold tabular-nums",
          tone === "good" && "text-emerald-700 dark:text-emerald-400",
          tone === "bad" && "text-destructive",
        )}
      >
        {value.toLocaleString()}
      </p>
    </div>
  );
}

function RadioOption({
  checked,
  onChange,
  title,
  description,
}: {
  checked: boolean;
  onChange: () => void;
  title: string;
  description: string;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm",
        checked && "border-primary bg-primary/5",
      )}
    >
      <input type="radio" className="mt-0.5 accent-primary" checked={checked} onChange={onChange} />
      <span className="grid gap-0.5">
        <span className="font-medium">{title}</span>
        <span className="text-muted-foreground">{description}</span>
      </span>
    </label>
  );
}
