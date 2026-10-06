import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STYLES: Record<string, { label: string; className: string }> = {
  active: { label: "Active", className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
  paused: { label: "Paused", className: "bg-muted text-muted-foreground" },
  error: { label: "Error", className: "bg-destructive/10 text-destructive" },
};

export function AccountStatusBadge({ status }: { status: string }) {
  const s = STYLES[status] ?? { label: status, className: "" };
  return (
    <Badge variant="secondary" className={cn("font-medium", s.className)}>
      {s.label}
    </Badge>
  );
}
