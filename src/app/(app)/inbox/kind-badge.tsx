import { Badge } from "@/components/ui/badge";

export const KIND_LABEL: Record<string, string> = {
  reply: "Reply",
  auto_reply: "Out of office",
  bounce: "Bounced",
};

// What the message IS (set by the system): a reply, an automatic reply, a bounce.
// (A category, like "Interested", is set by the user: see categories.tsx.)
export function KindBadge({ kind }: { kind: string }) {
  if (kind === "bounce") return <Badge variant="destructive">{KIND_LABEL.bounce}</Badge>;
  if (kind === "auto_reply") return <Badge variant="secondary">{KIND_LABEL.auto_reply}</Badge>;
  return <Badge variant="outline">{KIND_LABEL.reply}</Badge>;
}
