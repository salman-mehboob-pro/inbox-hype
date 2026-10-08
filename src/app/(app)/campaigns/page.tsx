import { MegaphoneIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { timeAgo } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { CampaignActions } from "./campaign-actions";
import { NewCampaignButton } from "./new-campaign-button";
import { CampaignStatusBadge } from "./status-badge";

export const metadata: Metadata = { title: "Campaigns" };

export default async function CampaignsPage() {
  const { workspace } = await getCurrentWorkspace();
  const supabase = await createClient();
  const { data: campaigns, error } = await supabase
    .from("campaigns")
    .select(
      "id, name, status, created_at, campaign_leads(count), sequence_steps(count), campaign_email_accounts(count)",
    )
    .eq("workspace_id", workspace.id)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const count = (rel: { count: number }[] | null | undefined) => rel?.[0]?.count ?? 0;

  return (
    <>
      <PageHeader
        title="Campaigns"
        description="Sequences of emails sent from your inboxes to your leads."
        actions={campaigns.length > 0 ? <NewCampaignButton /> : undefined}
      />

      {campaigns.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-12 text-center">
          <span className="flex size-10 items-center justify-center rounded-full bg-muted">
            <MegaphoneIcon className="size-5 text-muted-foreground" />
          </span>
          <div className="grid gap-1">
            <p className="font-medium">No campaigns yet</p>
            <p className="text-sm text-muted-foreground">
              Write your emails, pick leads and inboxes, set a schedule, then start.
            </p>
          </div>
          <NewCampaignButton />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Leads</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Steps</TableHead>
                <TableHead className="hidden text-right md:table-cell">Inboxes</TableHead>
                <TableHead className="hidden lg:table-cell">Created</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaigns.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="max-w-72">
                    <Link href={`/campaigns/${c.id}`} className="block truncate font-medium hover:underline">
                      {c.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <CampaignStatusBadge status={c.status} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{count(c.campaign_leads)}</TableCell>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">
                    {count(c.sequence_steps)}
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums md:table-cell">
                    {count(c.campaign_email_accounts)}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground lg:table-cell">{timeAgo(c.created_at)}</TableCell>
                  <TableCell className="text-right">
                    <CampaignActions id={c.id} name={c.name} status={c.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
