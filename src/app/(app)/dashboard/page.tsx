import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const { workspace } = await getCurrentWorkspace();
  const supabase = await createClient();

  const count = (table: "email_accounts" | "leads" | "campaigns") =>
    supabase
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspace.id)
      .then(({ count }) => count ?? 0);

  const [inboxes, leads, campaigns] = await Promise.all([
    count("email_accounts"),
    count("leads"),
    count("campaigns"),
  ]);

  const stats = [
    { label: "Email accounts", value: inboxes },
    { label: "Leads", value: leads },
    { label: "Campaigns", value: campaigns },
  ];

  return (
    <>
      <PageHeader title="Dashboard" description={`Overview for ${workspace.name}`} />
      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardHeader>
              <CardDescription>{s.label}</CardDescription>
              <CardTitle className="text-2xl tabular-nums">{s.value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>
    </>
  );
}
