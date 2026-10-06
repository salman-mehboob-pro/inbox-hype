import { ArrowLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { startOfDayInTimeZone } from "@/lib/time";
import { getCurrentWorkspace } from "@/lib/workspace";
import { CampaignActivity, type ActivityFilters } from "./campaign-activity";
import { CampaignAnalytics, type CampaignStats } from "./campaign-analytics";
import { CampaignHeader } from "./campaign-header";
import { CampaignLeads } from "./campaign-leads";
import { CampaignTabs } from "./campaign-tabs";
import { OptionsForm } from "./options-form";
import { ScheduleForm } from "./schedule-form";
import { SequenceEditor } from "./sequence-editor";

export const metadata: Metadata = { title: "Campaign" };

const LEADS_PAGE_SIZE = 50;
const ACTIVITY_PAGE_SIZE = 50;

// Start of the Activity "Date" filter. "today" = today in the campaign's timezone.
function activitySince(range: string, timeZone: string): Date | null {
  const now = new Date();
  if (range === "today") return startOfDayInTimeZone(now, timeZone);
  if (range === "7d") return new Date(now.getTime() - 7 * 86400_000);
  if (range === "30d") return new Date(now.getTime() - 30 * 86400_000);
  return null;
}
const LEAD_STATUSES = ["queued", "in_progress", "completed", "replied", "bounced", "unsubscribed", "stopped", "failed"];

export default async function CampaignPage({ params, searchParams }: PageProps<"/campaigns/[id]">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const sp = await searchParams;
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const page = Math.max(1, Number(sp.page) || 1);

  const { workspace } = await getCurrentWorkspace();
  const supabase = await createClient();

  const { data: campaign, error } = await supabase.from("campaigns").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!campaign) notFound();

  // Drafts open on the sequence; running campaigns open on analytics (like FoxReach).
  const tab = str(sp.tab) || (campaign.status === "draft" ? "sequence" : "analytics");

  // Activity filters live in the URL (a* params).
  const activityFilters: ActivityFilters = {
    q: str(sp.aq).replace(/[%_\\]/g, " ").trim().slice(0, 100),
    date: ["today", "7d", "30d"].includes(str(sp.adate)) ? str(sp.adate) : "all",
    type: str(sp.atype) || "all",
    step: /^\d+$/.test(str(sp.astep)) ? str(sp.astep) : "all",
    page: Math.max(1, Number(sp.apage) || 1),
  };
  const since = activitySince(activityFilters.date, campaign.timezone);

  const [stats, activity] = await Promise.all([
    supabase.rpc("campaign_stats", { p_campaign_id: id }),
    tab === "activity"
      ? supabase.rpc("campaign_activity", {
          p_campaign_id: id,
          p_search: activityFilters.q || undefined,
          p_type: activityFilters.type === "all" ? undefined : activityFilters.type,
          p_step: activityFilters.step === "all" ? undefined : Number(activityFilters.step),
          p_since: since?.toISOString(),
          p_limit: ACTIVITY_PAGE_SIZE,
          p_offset: (activityFilters.page - 1) * ACTIVITY_PAGE_SIZE,
        })
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (stats.error) throw stats.error;
  if (activity.error) throw activity.error;

  const [steps, accounts, chosen, campaignLeads, tags, customKeys, sampleLead, ...statusCounts] = await Promise.all([
    supabase
      .from("sequence_steps")
      .select("id, position, delay_days, delay_hours, subject, body, body_format")
      .eq("campaign_id", id)
      .order("position"),
    supabase
      .from("email_accounts")
      .select("id, email, from_name, status, daily_limit")
      .eq("workspace_id", workspace.id)
      .order("created_at"),
    supabase.from("campaign_email_accounts").select("email_account_id").eq("campaign_id", id),
    supabase
      .from("campaign_leads")
      .select("id, status, next_step, last_sent_at, lead:leads(id, email, first_name, last_name, company)", {
        count: "exact",
      })
      .eq("campaign_id", id)
      .order("created_at", { ascending: false })
      .order("id")
      .range((page - 1) * LEADS_PAGE_SIZE, page * LEADS_PAGE_SIZE - 1),
    supabase.rpc("workspace_lead_tags", { p_workspace_id: workspace.id }),
    supabase.rpc("workspace_custom_field_keys", { p_workspace_id: workspace.id }),
    // A real lead for the preview: first lead in this campaign, else any lead.
    supabase
      .from("campaign_leads")
      .select("lead:leads(email, first_name, last_name, company, title, phone, website, linkedin_url, timezone, custom_fields)")
      .eq("campaign_id", id)
      .order("created_at")
      .limit(1)
      .maybeSingle(),
    ...LEAD_STATUSES.map((s) =>
      supabase
        .from("campaign_leads")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", id)
        .eq("status", s),
    ),
  ]);
  for (const r of [steps, accounts, chosen, campaignLeads, tags, customKeys, sampleLead, ...statusCounts]) {
    if (r.error) throw r.error;
  }

  let preview = sampleLead.data?.lead ?? null;
  if (!preview) {
    const { data } = await supabase
      .from("leads")
      .select("email, first_name, last_name, company, title, phone, website, linkedin_url, timezone, custom_fields")
      .eq("workspace_id", workspace.id)
      .order("created_at")
      .limit(1)
      .maybeSingle();
    preview = data;
  }

  const counts = Object.fromEntries(LEAD_STATUSES.map((s, i) => [s, statusCounts[i].count ?? 0]));
  const chosenIds = (chosen.data ?? []).map((c) => c.email_account_id);
  const firstSender = (accounts.data ?? []).find((a) => chosenIds.includes(a.id));

  return (
    <>
      <div className="grid gap-3">
        <Link
          href="/campaigns"
          className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon className="size-4" />
          Campaigns
        </Link>
        <CampaignHeader id={campaign.id} name={campaign.name} status={campaign.status} />
      </div>

      <CampaignTabs
        tab={tab}
        leadsCount={campaignLeads.count ?? 0}
        stepsCount={steps.data?.length ?? 0}
        analytics={
          <CampaignAnalytics
            stats={stats.data as unknown as CampaignStats}
            trackOpens={campaign.track_opens}
            trackClicks={campaign.track_clicks}
          />
        }
        activity={
          <CampaignActivity
            rows={activity.data ?? []}
            total={activity.data?.[0]?.total_count ?? 0}
            pageSize={ACTIVITY_PAGE_SIZE}
            filters={activityFilters}
            stepCount={steps.data?.length ?? 0}
          />
        }
        sequence={
          <SequenceEditor
            campaignId={campaign.id}
            initialSteps={steps.data ?? []}
            customKeys={(customKeys.data ?? []).map((k) => k.key)}
            previewLead={
              preview
                ? {
                    ...preview,
                    custom_fields:
                      preview.custom_fields && typeof preview.custom_fields === "object" && !Array.isArray(preview.custom_fields)
                        ? (preview.custom_fields as Record<string, unknown>)
                        : {},
                  }
                : null
            }
            sender={firstSender ? { name: firstSender.from_name, email: firstSender.email } : {}}
          />
        }
        leads={
          <CampaignLeads
            campaignId={campaign.id}
            rows={(campaignLeads.data ?? []).flatMap((r) => (r.lead ? [{ ...r, lead: r.lead }] : []))}
            total={campaignLeads.count ?? 0}
            page={page}
            pageSize={LEADS_PAGE_SIZE}
            counts={counts}
            tags={tags.data ?? []}
            completed={campaign.status === "completed"}
          />
        }
        schedule={
          <ScheduleForm
            campaignId={campaign.id}
            initial={{
              timezone: campaign.timezone,
              send_days: campaign.send_days,
              window_start: campaign.window_start.slice(0, 5),
              window_end: campaign.window_end.slice(0, 5),
              use_lead_timezone: campaign.use_lead_timezone,
            }}
          />
        }
        options={
          <OptionsForm
            campaignId={campaign.id}
            accounts={accounts.data ?? []}
            initial={{
              daily_limit: String(campaign.daily_limit),
              gap_min_minutes: String(campaign.gap_min_minutes),
              gap_max_minutes: String(campaign.gap_max_minutes),
              track_opens: campaign.track_opens,
              track_clicks: campaign.track_clicks,
              stop_on_reply: campaign.stop_on_reply,
              include_unsubscribe: campaign.include_unsubscribe,
              email_account_ids: chosenIds,
            }}
          />
        }
      />
    </>
  );
}
