import { Badge } from "@/components/ui/badge";

export const KIND_LABEL: Record<string, string> = {
  reply: "Reply",
  auto_reply: "Out of office",
  bounce: "Bounced",
  other: "Other mail",
};

// What the message IS (set by the system): a reply to a campaign email, an
// automatic reply, a bounce, or other mail (not about one of our emails).
// (A category, like "Interested", is set by the user: see categories.tsx.)
export function KindBadge({ kind }: { kind: string }) {
  if (kind === "bounce") return <Badge variant="destructive">{KIND_LABEL.bounce}</Badge>;
  if (kind === "auto_reply") return <Badge variant="secondary">{KIND_LABEL.auto_reply}</Badge>;
  if (kind === "other") return <Badge variant="secondary">{KIND_LABEL.other}</Badge>;
  return <Badge variant="outline">{KIND_LABEL.reply}</Badge>;
}
