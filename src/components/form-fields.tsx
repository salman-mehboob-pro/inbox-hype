"use client";

import { Loader2Icon } from "lucide-react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type FieldProps = React.ComponentProps<"input"> & {
  label: string;
  name: string;
  errors?: string[];
  hint?: string;
};

// Label + input + error text, wired up for accessibility.
export function Field({ label, name, errors, hint, id, ...props }: FieldProps) {
  const inputId = id ?? name;
  const errorId = `${inputId}-error`;
  const hasError = Boolean(errors?.length);

  return (
    <div className="grid gap-1.5">
      <Label htmlFor={inputId}>{label}</Label>
      <Input
        id={inputId}
        name={name}
        aria-invalid={hasError || undefined}
        aria-describedby={hasError ? errorId : undefined}
        {...props}
      />
      {hasError ? (
        <p id={errorId} className="text-xs text-destructive">
          {errors![0]}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

export function SubmitButton({
  children,
  pendingText,
  className,
}: {
  children: React.ReactNode;
  pendingText?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending} className={className}>
      {pending && <Loader2Icon className="animate-spin" />}
      {pending ? (pendingText ?? children) : children}
    </Button>
  );
}

export function FormMessage({ error, message }: { error?: string; message?: string }) {
  if (error) {
    return (
      <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
        {error}
      </p>
    );
  }
  if (message) {
    return (
      <p role="status" className="rounded-lg bg-muted px-3 py-2 text-sm">
        {message}
      </p>
    );
  }
  return null;
}
