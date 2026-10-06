"use client";

import { CheckCircle2Icon, Loader2Icon } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { confirmUnsubscribe } from "./actions";

export function UnsubscribeButton({
  id,
  email,
  sender,
  alreadyDone,
}: {
  id: string;
  email: string;
  sender: string;
  alreadyDone: boolean;
}) {
  const [done, setDone] = useState(alreadyDone);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (done) {
    return (
      <div className="grid justify-items-center gap-2 text-center">
        <CheckCircle2Icon className="size-10 text-green-600" />
        <p className="font-medium">You are unsubscribed</p>
        <p className="text-sm text-muted-foreground">
          {email} will not get more emails from {sender}.
        </p>
      </div>
    );
  }

  return (
    <div className="grid justify-items-center gap-4 text-center">
      <div className="grid gap-1">
        <p className="font-medium">Unsubscribe from {sender}?</p>
        <p className="text-sm text-muted-foreground">{email} will not get any more emails from them.</p>
      </div>
      <Button
        size="lg"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await confirmUnsubscribe(id);
            if (result.ok) setDone(true);
            else setError(result.error ?? "Something went wrong. Please try again.");
          })
        }
      >
        {pending && <Loader2Icon className="animate-spin" />}
        Unsubscribe
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
