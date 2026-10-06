import { SendIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2 font-semibold tracking-tight", className)}>
      <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <SendIcon className="size-4" />
      </span>
      InboxHype
    </span>
  );
}
