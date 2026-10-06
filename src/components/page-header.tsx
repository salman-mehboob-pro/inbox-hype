export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="grid gap-1">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function ComingSoon({ step }: { step: string }) {
  return (
    <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed p-12 text-center text-sm text-muted-foreground">
      This screen is built in {step}.
    </div>
  );
}
