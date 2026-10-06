"use client";

import { Loader2Icon, SendIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { sendReply } from "./actions";

export function ReplyBox({ messageId, to, from }: { messageId: string; to: string; from: string }) {
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();

  function send() {
    startTransition(async () => {
      const result = await sendReply(messageId, text);
      if (result.ok) {
        toast.success(`Reply sent to ${to}`);
        setText("");
      } else {
        toast.error(result.error ?? "The reply was not sent.");
      }
    });
  }

  return (
    <div className="grid gap-2 rounded-lg border bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground">
        Reply to <span className="font-medium text-foreground">{to}</span> from{" "}
        <span className="font-medium text-foreground">{from}</span>
      </p>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Write your reply…"
        rows={5}
        disabled={pending}
        aria-label="Your reply"
      />
      <div className="flex justify-end">
        <Button onClick={send} disabled={pending || !text.trim()}>
          {pending ? <Loader2Icon className="animate-spin" /> : <SendIcon />}
          {pending ? "Sending…" : "Send reply"}
        </Button>
      </div>
    </div>
  );
}
