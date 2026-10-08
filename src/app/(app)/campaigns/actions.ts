"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { lintTemplate } from "@/lib/email/template";
import { isValidTimeZone } from "@/lib/leads/import";
import { logger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { addLeadsSchema, nameSchema, optionsSchema, scheduleSchema, sequenceSchema } from "./schema";

export type CampaignActionResult = {
  ok: boolean;
  error?: string;
  // Reasons a campaign can't start yet.
  problems?: string[];
  fieldErrors?: Record<string, string[] | undefined>;
  id?: string;
  count?: number;
  stepIds?: string[];
};

const GENERIC_ERROR = "Something went wrong. Please try again.";
const idSchema = z.uuid();

function refresh(id: string) {
  revalidatePath("/campaigns");
  revalidatePath(`/campaigns/${id}`);
}

// Loads a campaign only if it belongs to the user's workspace (RLS enforces it).
async function getOwnedCampaign(id: unknown) {
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.from("campaigns").select("*").eq("id", parsed.data).maybeSingle();
  if (error) throw error;
  return data;
}

export async function createCampaign(input: { name?: string; timezone?: string }): Promise<CampaignActionResult> {
  const { workspace } = await getCurrentWorkspace();
  const name = nameSchema.safeParse(input.name || "New campaign");
  if (!name.success) return { ok: false, error: name.error.issues[0]?.message };
  const timezone = input.timezone && isValidTimeZone(input.timezone) ? input.timezone : workspace.timezone;

  const supabase = await createClient();
  const { data: campaign, error } = await supabase
    .from("campaigns")
    .insert({ workspace_id: workspace.id, name: name.data, timezone })
    .select("id")
    .single();
  if (error) {
    logger.error("create campaign failed", { error, workspaceId: workspace.id });
    return { ok: false, error: GENERIC_ERROR };
  }

  // Start with one empty step so the editor has something to show.
  const { error: stepError } = await supabase.rpc("save_sequence", {
    p_campaign_id: campaign.id,
    p_steps: [{ delay_days: 0, delay_hours: 0, subject: "", body: "" }],
  });
  if (stepError) logger.error("create first step failed", { error: stepError, campaignId: campaign.id });

  // No inbox is chosen yet: the user adds the inboxes in the Options tab.
  revalidatePath("/campaigns");
  return { ok: true, id: campaign.id };
}

export async function renameCampaign(id: string, name: unknown): Promise<CampaignActionResult> {
  const campaign = await getOwnedCampaign(id);
  if (!campaign) return { ok: false, error: "Campaign not found." };
  const parsed = nameSchema.safeParse(name);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };

  const supabase = await createClient();
  const { error } = await supabase.from("campaigns").update({ name: parsed.data }).eq("id", campaign.id);
  if (error) {
    logger.error("rename campaign failed", { error, campaignId: campaign.id });
    return { ok: false, error: GENERIC_ERROR };
  }
  refresh(campaign.id);
  return { ok: true };
}

export async function saveSequence(id: string, steps: unknown): Promise<CampaignActionResult> {
  const campaign = await getOwnedCampaign(id);
  if (!campaign) return { ok: false, error: "Campaign not found." };
  const parsed = sequenceSchema.safeParse(steps);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the steps." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_sequence", { p_campaign_id: campaign.id, p_steps: parsed.data });
  if (error) {
    if (error.message.includes("step_has_sends")) {
      return { ok: false, error: "A step that already sent emails can't be deleted. Edit it instead." };
    }
    logger.error("save sequence failed", { error, campaignId: campaign.id });
    return { ok: false, error: GENERIC_ERROR };
  }
  refresh(campaign.id);
  // Ids in step order, so the editor can link new steps to their saved rows.
  return { ok: true, stepIds: (data ?? []).map((s) => s.id) };
}

export async function saveSchedule(id: string, input: unknown): Promise<CampaignActionResult> {
  const campaign = await getOwnedCampaign(id);
  if (!campaign) return { ok: false, error: "Campaign not found." };
  const parsed = scheduleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: z.flattenError(parsed.error).fieldErrors };

  const supabase = await createClient();
  const { error } = await supabase.from("campaigns").update(parsed.data).eq("id", campaign.id);
  if (error) {
    logger.error("save schedule failed", { error, campaignId: campaign.id });
    return { ok: false, error: GENERIC_ERROR };
  }
  refresh(campaign.id);
  return { ok: true };
}

export async function saveOptions(id: string, input: unknown): Promise<CampaignActionResult> {
  const campaign = await getOwnedCampaign(id);
  if (!campaign) return { ok: false, error: "Campaign not found." };
  const parsed = optionsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const { email_account_ids, ...fields } = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.from("campaigns").update(fields).eq("id", campaign.id);
  if (error) {
    logger.error("save campaign options failed", { error, campaignId: campaign.id });
    return { ok: false, error: GENERIC_ERROR };
  }

  // Replace the inbox list: remove unticked, add new ones.
  const { data: current, error: currentError } = await supabase
    .from("campaign_email_accounts")
    .select("email_account_id")
    .eq("campaign_id", campaign.id);
  if (currentError) {
    logger.error("load campaign inboxes failed", { error: currentError, campaignId: campaign.id });
    return { ok: false, error: GENERIC_ERROR };
  }
  const have = new Set(current.map((c) => c.email_account_id));
  const want = new Set(email_account_ids);
  const toRemove = [...have].filter((x) => !want.has(x));
  const toAdd = [...want].filter((x) => !have.has(x));

  if (toRemove.length) {
    const { error: e } = await supabase
      .from("campaign_email_accounts")
      .delete()
      .eq("campaign_id", campaign.id)
      .in("email_account_id", toRemove);
    if (e) {
      logger.error("remove campaign inboxes failed", { error: e, campaignId: campaign.id });
      return { ok: false, error: GENERIC_ERROR };
    }
  }
  if (toAdd.length) {
    // Composite FK makes sure each inbox belongs to the same workspace.
    const { error: e } = await supabase.from("campaign_email_accounts").insert(
      toAdd.map((accountId) => ({
        campaign_id: campaign.id,
        email_account_id: accountId,
        workspace_id: campaign.workspace_id,
      })),
    );
    if (e) {
      logger.error("add campaign inboxes failed", { error: e, campaignId: campaign.id });
      return { ok: false, error: "One of the inboxes could not be added." };
    }
  }

  refresh(campaign.id);
  return { ok: true };
}

export async function addLeadsToCampaign(id: string, input: unknown): Promise<CampaignActionResult> {
  const campaign = await getOwnedCampaign(id);
  if (!campaign) return { ok: false, error: "Campaign not found." };
  if (campaign.status === "completed") return { ok: false, error: "This campaign is completed." };
  const parsed = addLeadsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("add_leads_to_campaign", {
    p_campaign_id: campaign.id,
    p_tag: parsed.data.mode === "tag" ? parsed.data.tag : undefined,
  });
  if (error) {
    logger.error("add leads to campaign failed", { error, campaignId: campaign.id });
    return { ok: false, error: GENERIC_ERROR };
  }
  refresh(campaign.id);
  return { ok: true, count: data ?? 0 };
}

export async function removeCampaignLeads(id: string, campaignLeadIds: unknown): Promise<CampaignActionResult> {
  const campaign = await getOwnedCampaign(id);
  if (!campaign) return { ok: false, error: "Campaign not found." };
  const ids = z.array(z.uuid()).min(1).max(1000).safeParse(campaignLeadIds);
  if (!ids.success) return { ok: false, error: "Nothing selected." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("remove_leads_from_campaign", {
    p_campaign_id: campaign.id,
    p_campaign_lead_ids: ids.data,
  });
  if (error) {
    logger.error("remove campaign leads failed", { error, campaignId: campaign.id });
    return { ok: false, error: GENERIC_ERROR };
  }
  refresh(campaign.id);
  return { ok: true, count: data ?? 0 };
}

// Everything that must be true before a campaign can send.
async function startProblems(campaignId: string): Promise<string[]> {
  const supabase = await createClient();
  const [steps, inboxes, leads] = await Promise.all([
    supabase
      .from("sequence_steps")
      .select("position, subject, body")
      .eq("campaign_id", campaignId)
      .order("position"),
    supabase
      .from("campaign_email_accounts")
      .select("email_account:email_accounts(status)")
      .eq("campaign_id", campaignId),
    supabase
      .from("campaign_leads")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .in("status", ["queued", "in_progress"]),
  ]);
  if (steps.error) throw steps.error;
  if (inboxes.error) throw inboxes.error;
  if (leads.error) throw leads.error;

  const problems: string[] = [];
  if (!steps.data.length) problems.push("Add at least one email to the sequence.");
  for (const s of steps.data) {
    if (s.position === 1 && !s.subject.trim()) problems.push("Step 1 needs a subject.");
    const hasContent = s.body.replace(/<(?!img)[^>]*>/gi, "").replace(/&nbsp;/g, " ").trim() || /<img/i.test(s.body);
    if (!hasContent) problems.push(`Step ${s.position} has no email text.`);
    for (const p of [...lintTemplate(s.subject), ...lintTemplate(s.body)]) problems.push(`Step ${s.position}: ${p}`);
  }
  if (!inboxes.data.length) problems.push("Choose at least one inbox to send from (Options tab).");
  else if (!inboxes.data.some((i) => i.email_account?.status === "active")) {
    problems.push("None of the chosen inboxes is active. Fix or resume an inbox first.");
  }
  if (!leads.count) problems.push("Add leads to the campaign.");
  return [...new Set(problems)];
}

export async function startCampaign(id: string): Promise<CampaignActionResult> {
  const campaign = await getOwnedCampaign(id);
  if (!campaign) return { ok: false, error: "Campaign not found." };
  if (campaign.status === "active") return { ok: true };
  if (campaign.status === "completed") return { ok: false, error: "This campaign is completed." };

  const problems = await startProblems(campaign.id);
  if (problems.length) return { ok: false, problems };

  const supabase = await createClient();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("campaigns")
    .update({
      status: "active",
      started_at: campaign.started_at ?? now,
      paused_reason: null,
      // Resumed after a bounce pause: count bounces from now on, so the old ones
      // don't pause it again at the next bounce.
      ...(campaign.paused_reason ? { bounce_check_from: now } : {}),
    })
    .eq("id", campaign.id);
  if (error) {
    logger.error("start campaign failed", { error, campaignId: campaign.id });
    return { ok: false, error: GENERIC_ERROR };
  }
  logger.info("campaign started", { campaignId: campaign.id });
  refresh(campaign.id);
  return { ok: true };
}

export async function pauseCampaign(id: string): Promise<CampaignActionResult> {
  const campaign = await getOwnedCampaign(id);
  if (!campaign) return { ok: false, error: "Campaign not found." };
  if (campaign.status !== "active") return { ok: true };

  const supabase = await createClient();
  const { error } = await supabase
    .from("campaigns")
    .update({ status: "paused", paused_reason: null })
    .eq("id", campaign.id);
  if (error) {
    logger.error("pause campaign failed", { error, campaignId: campaign.id });
    return { ok: false, error: GENERIC_ERROR };
  }
  logger.info("campaign paused", { campaignId: campaign.id });
  refresh(campaign.id);
  return { ok: true };
}

// Copies settings, sequence and inboxes (not leads or history); the copy is a draft.
export async function duplicateCampaign(id: string): Promise<CampaignActionResult> {
  const campaign = await getOwnedCampaign(id);
  if (!campaign) return { ok: false, error: "Campaign not found." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("duplicate_campaign", { p_campaign_id: campaign.id });
  if (error) {
    logger.error("duplicate campaign failed", { error, campaignId: campaign.id });
    return { ok: false, error: GENERIC_ERROR };
  }
  logger.info("campaign duplicated", { campaignId: campaign.id, newCampaignId: data });
  revalidatePath("/campaigns");
  return { ok: true, id: data };
}

export async function deleteCampaign(id: string): Promise<CampaignActionResult> {
  const campaign = await getOwnedCampaign(id);
  if (!campaign) return { ok: false, error: "Campaign not found." };

  const supabase = await createClient();
  const { error } = await supabase.from("campaigns").delete().eq("id", campaign.id);
  if (error) {
    logger.error("delete campaign failed", { error, campaignId: campaign.id });
    return { ok: false, error: GENERIC_ERROR };
  }
  logger.info("campaign deleted", { campaignId: campaign.id });
  revalidatePath("/campaigns");
  return { ok: true };
}
