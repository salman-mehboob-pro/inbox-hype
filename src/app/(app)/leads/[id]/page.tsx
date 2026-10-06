import { ArrowLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { getCurrentWorkspace } from "@/lib/workspace";
import { CampaignsCard } from "./campaigns-card";
import { ContactCard } from "./contact-card";
import { CustomFieldsCard } from "./custom-fields-card";
import { DangerZone } from "./danger-zone";
import { NotesCard } from "./notes-card";
import { TagsCard } from "./tags-card";

export const metadata: Metadata = { title: "Lead" };

const STATUS_STYLES: Record<string, string> = {
  active: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  unsubscribed: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  bounced: "bg-destructive/10 text-destructive",
  complained: "bg-destructive/10 text-destructive",
  suppressed: "bg-muted text-muted-foreground",
};

export default async function LeadPage({ params }: PageProps<"/leads/[id]">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const { workspace } = await getCurrentWorkspace();
  const supabase = await createClient();

  const { data: lead, error } = await supabase.from("leads").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!lead) notFound();

  const [suppression, memberships, campaigns, tags] = await Promise.all([
    supabase
      .from("suppressions")
      .select("reason")
      .eq("workspace_id", workspace.id)
      .eq("email", lead.email)
      .maybeSingle(),
    supabase
      .from("campaign_leads")
      .select("id, status, campaign:campaigns(id, name, status)")
      .eq("lead_id", lead.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("campaigns")
      .select("id, name")
      .eq("workspace_id", workspace.id)
      .neq("status", "completed")
      .order("created_at", { ascending: false }),
    supabase.rpc("workspace_lead_tags", { p_workspace_id: workspace.id }),
  ]);
  for (const r of [suppression, memberships, campaigns, tags]) if (r.error) throw r.error;

  // A lead is "active" unless its email is on the suppression list.
  const reason = suppression.data?.reason;
  const status = !reason ? "active" : reason === "manual" ? "suppressed" : reason;

  const name = [lead.first_name, lead.last_name].filter(Boolean).join(" ");
  const inCampaigns = (memberships.data ?? []).flatMap((m) =>
    m.campaign ? [{ id: m.campaign.id, name: m.campaign.name, campaignStatus: m.campaign.status, leadStatus: m.status }] : [],
  );
  const inIds = new Set(inCampaigns.map((c) => c.id));

  const customFields =
    lead.custom_fields && typeof lead.custom_fields === "object" && !Array.isArray(lead.custom_fields)
      ? Object.fromEntries(Object.entries(lead.custom_fields).map(([k, v]) => [k, String(v ?? "")]))
      : {};

  return (
    <>
      <div className="grid gap-3">
        <Link
          href="/leads"
          className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon className="size-4" />
          Leads
        </Link>
        <div className="grid gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{name || lead.email}</h1>
            <Badge variant="secondary" className={cn("gap-1.5 font-medium capitalize", STATUS_STYLES[status])}>
              <span className="size-1.5 rounded-full bg-current" />
              {status}
            </Badge>
          </div>
          {name && <p className="text-sm text-muted-foreground">{lead.email}</p>}
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid gap-6">
          <ContactCard
            id={lead.id}
            initial={{
              email: lead.email,
              first_name: lead.first_name ?? "",
              last_name: lead.last_name ?? "",
              company: lead.company ?? "",
              title: lead.title ?? "",
              phone: lead.phone ?? "",
              linkedin_url: lead.linkedin_url ?? "",
              website: lead.website ?? "",
              timezone: lead.timezone ?? "",
            }}
          />
          <NotesCard id={lead.id} initial={lead.notes} />
          <CustomFieldsCard id={lead.id} initial={customFields} />
        </div>
        <div className="grid gap-6">
          <TagsCard
            id={lead.id}
            tags={lead.tags}
            suggestions={(tags.data ?? []).map((t) => t.tag).filter((t) => !lead.tags.includes(t))}
          />
          <CampaignsCard
            id={lead.id}
            inCampaigns={inCampaigns}
            available={(campaigns.data ?? []).filter((c) => !inIds.has(c.id))}
          />
          <DangerZone id={lead.id} email={lead.email} />
        </div>
      </div>
    </>
  );
}
