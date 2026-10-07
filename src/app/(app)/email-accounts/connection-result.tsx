import { CheckCircle2Icon, MinusCircleIcon, XCircleIcon } from "lucide-react";
import type { CheckResult, ConnectionTestResult } from "@/lib/email/connection-test";

function Row({ label, result }: { label: string; result: CheckResult | null }) {
  if (result === null) {
    return (
      <li className="flex items-start gap-2 text-muted-foreground">
        <MinusCircleIcon className="mt-0.5 size-4 shrink-0" />
        <span>{label}: not used</span>
      </li>
    );
  }
  return result.ok ? (
    <li className="flex items-start gap-2 text-emerald-700 dark:text-emerald-400">
      <CheckCircle2Icon className="mt-0.5 size-4 shrink-0" />
      <span>{label}: connected</span>
    </li>
  ) : (
    <li className="flex items-start gap-2 text-destructive">
      <XCircleIcon className="mt-0.5 size-4 shrink-0" />
      <span>{result.error}</span>
    </li>
  );
}

// Shows the SMTP (send) and IMAP (read replies) test results.
export function ConnectionResult({ test }: { test: ConnectionTestResult }) {
  return (
    <ul role="status" className="grid gap-1.5 rounded-lg border bg-muted/40 p-3 text-sm">
      <Row label={test.via === "postal" ? "Sending (Postal API)" : "Sending (SMTP)"} result={test.smtp} />
      {test.via === "postal" ? (
        <li className="flex items-start gap-2 text-muted-foreground">
          <MinusCircleIcon className="mt-0.5 size-4 shrink-0" />
          <span>Replies: through the Postal route (set up on the inbox page)</span>
        </li>
      ) : (
        <Row label="Reading replies (IMAP)" result={test.imap} />
      )}
    </ul>
  );
}
