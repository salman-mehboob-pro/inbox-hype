import { CheckCircle2Icon, MinusCircleIcon, XCircleIcon } from "lucide-react";
import type { CheckResult } from "@/lib/email/connection-test";

// Shows the Postal connection test result.
export function ConnectionResult({ test }: { test: CheckResult }) {
  return (
    <ul role="status" className="grid gap-1.5 rounded-lg border bg-muted/40 p-3 text-sm">
      {test.ok ? (
        <li className="flex items-start gap-2 text-emerald-700 dark:text-emerald-400">
          <CheckCircle2Icon className="mt-0.5 size-4 shrink-0" />
          <span>Postal: connected, and allowed to send from this address</span>
        </li>
      ) : (
        <li className="flex items-start gap-2 text-destructive">
          <XCircleIcon className="mt-0.5 size-4 shrink-0" />
          <span>{test.error}</span>
        </li>
      )}
      <li className="flex items-start gap-2 text-muted-foreground">
        <MinusCircleIcon className="mt-0.5 size-4 shrink-0" />
        <span>Replies: through the Postal route (set up on the inbox page)</span>
      </li>
    </ul>
  );
}
