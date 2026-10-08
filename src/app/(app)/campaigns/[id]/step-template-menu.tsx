"use client";

import { ChevronDownIcon, FileTextIcon, Loader2Icon, SaveIcon, SearchIcon } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { isEmptyBody } from "@/components/email-editor/email-editor";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createTemplate } from "../../templates/actions";
import type { TemplateOption } from "../../templates/schema";

// Per step: fill the step from a saved template, or save the step as a new template.
export function StepTemplateMenu({
  stepNumber,
  step,
  templates,
  onApply,
  onSaved,
}: {
  stepNumber: number;
  step: { subject: string; body: string; body_format: string };
  templates: TemplateOption[];
  onApply: (template: TemplateOption) => void;
  onSaved: (template: TemplateOption) => void;
}) {
  const [open, setOpen] = useState<"use" | "save" | null>(null);
  const [query, setQuery] = useState("");
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const stepIsEmpty = !step.subject.trim() && isEmptyBody(step.body);
  const q = query.trim().toLowerCase();
  const shown = q
    ? templates.filter((t) => t.name.toLowerCase().includes(q) || t.subject.toLowerCase().includes(q))
    : templates;

  function pick(t: TemplateOption) {
    onApply(t);
    setOpen(null);
    toast.success(`"${t.name}" added to step ${stepNumber}`);
  }

  function openSave() {
    setName(step.subject.trim().slice(0, 200) || `Step ${stepNumber}`);
    setNameError(undefined);
    setOpen("save");
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    setNameError(undefined);
    startTransition(async () => {
      const res = await createTemplate({ name, ...step });
      if (res.ok && res.template) {
        onSaved(res.template);
        setOpen(null);
        toast.success("Saved as template");
      } else if (res.fieldErrors?.name?.[0]) setNameError(res.fieldErrors.name[0]);
      else toast.error(res.error ?? Object.values(res.fieldErrors ?? {})[0]?.[0] ?? "Could not save the template.");
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="sm" aria-label={`Templates for step ${stepNumber}`} />}
        >
          <FileTextIcon />
          Template
          <ChevronDownIcon className="size-3" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-48">
          <DropdownMenuItem
            onClick={() => {
              setQuery("");
              setOpen("use");
            }}
          >
            <FileTextIcon />
            Use a template
          </DropdownMenuItem>
          <DropdownMenuItem disabled={stepIsEmpty} onClick={openSave}>
            <SaveIcon />
            Save step as template
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={open === "use"} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Use a template in step {stepNumber}</DialogTitle>
            <DialogDescription>
              {stepIsEmpty
                ? "The template's subject and text are copied into this step. You can still edit them."
                : "This replaces the step's current subject and text. You can still edit them after."}
            </DialogDescription>
          </DialogHeader>
          {templates.length === 0 ? (
            <div className="grid gap-2 rounded-lg border border-dashed p-6 text-center text-sm">
              <p className="font-medium">No templates yet</p>
              <p className="text-muted-foreground">
                Create one in{" "}
                <Link href="/templates/new" className="underline underline-offset-2">
                  Templates
                </Link>
                , or write this step and use &quot;Save step as template&quot;.
              </p>
            </div>
          ) : (
            <div className="grid gap-2">
              <div className="relative">
                <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  aria-label="Search templates"
                  placeholder="Search templates"
                  className="pl-8"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <ul className="grid max-h-80 gap-1 overflow-y-auto">
                {shown.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => pick(t)}
                      className="grid w-full gap-0.5 rounded-md px-3 py-2 text-left hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                    >
                      <span className="truncate text-sm font-medium">{t.name}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {t.subject || "(no subject: replies in the same thread)"}
                      </span>
                    </button>
                  </li>
                ))}
                {shown.length === 0 && <li className="px-3 py-2 text-sm text-muted-foreground">No match.</li>}
              </ul>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={open === "save"} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent>
          <form onSubmit={save} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>Save step {stepNumber} as a template</DialogTitle>
              <DialogDescription>Its subject and text are saved so you can reuse them in any campaign.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-1.5">
              <Label htmlFor={`template-name-${stepNumber}`}>Template name</Label>
              <Input
                id={`template-name-${stepNumber}`}
                maxLength={200}
                required
                autoFocus
                aria-invalid={nameError ? true : undefined}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              {nameError && <p className="text-xs text-destructive">{nameError}</p>}
            </div>
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
              <Button type="submit" disabled={pending || !name.trim()}>
                {pending && <Loader2Icon className="animate-spin" />}
                Save template
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
