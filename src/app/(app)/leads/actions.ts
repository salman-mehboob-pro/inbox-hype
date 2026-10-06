"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import {
  contactSchema,
  customFieldsSchema,
  importChunkSchema,
  leadIdsSchema,
  newLeadSchema,
  notesSchema,
  tagsSchema,
} from "./schema";

export type ImportChunkResult =
  | { ok: true; inserted: number; updated: number; skipped: number }
  | { ok: false; error: string };

export type LeadActionResult = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  count?: number;
};

const GENERIC_ERROR = "Something went wrong. Please try again.";

// Called by the import wizard once per chunk of up to 500 leads.
export async function importLeadsChunk(input: unknown): Promise<ImportChunkResult> {
  const { workspace } = await getCurrentWorkspace();
  const parsed = importChunkSchema.safeParse(input);
  if (!parsed.success) {
    logger.warn("lead import chunk rejected", { issues: parsed.error.issues.slice(0, 5) });
    return { ok: false, error: "Some rows were not valid. Please re-check the file." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("import_leads", {
    p_workspace_id: workspace.id,
    p_rows: parsed.data.rows,
    p_update_existing: parsed.data.updateExisting,
  });
  if (error || !data?.[0]) {
    logger.error("lead import chunk failed", { error, workspaceId: workspace.id });
    return { ok: false, error: GENERIC_ERROR };
  }

  return { ok: true, ...data[0] };
}

// Called once after the last chunk so list pages show the new leads.
export async function finishImport() {
  revalidatePath("/leads");
  revalidatePath("/dashboard");
}

export async function createLead(input: unknown): Promise<LeadActionResult> {
  const { workspace } = await getCurrentWorkspace();
  const parsed = newLeadSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: z.flattenError(parsed.error).fieldErrors };

  const { campaignId, ...lead } = parsed.data;
  const supabase = await createClient();

  // Check the campaign first, so we don't add the lead and then fail.
  if (campaignId) {
    const { data: campaign } = await supabase
      .from("campaigns")
      .select("id, status")
      .eq("id", campaignId)
      .eq("workspace_id", workspace.id)
      .maybeSingle();
    if (!campaign) return { ok: false, fieldErrors: { campaignId: ["Campaign not found."] } };
    if (campaign.status === "completed") {
      return { ok: false, fieldErrors: { campaignId: ["This campaign is completed."] } };
    }
  }

  const { data: created, error } = await supabase
    .from("leads")
    .insert({ ...lead, workspace_id: workspace.id })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return { ok: false, fieldErrors: { email: ["This lead already exists."] } };
    logger.error("create lead failed", { error, workspaceId: workspace.id });
    return { ok: false, error: GENERIC_ERROR };
  }

  revalidatePath("/leads");
  revalidatePath("/dashboard");

  if (campaignId) {
    const { error: queueError } = await supabase
      .from("campaign_leads")
      .insert({ workspace_id: workspace.id, campaign_id: campaignId, lead_id: created.id });
    if (queueError) {
      logger.error("add lead to campaign failed", { error: queueError, campaignId });
      return { ok: false, error: "The lead was added, but not to the campaign. Please try adding it to the campaign again." };
    }
    revalidatePath(`/campaigns/${campaignId}`);
  }

  return { ok: true };
}

export async function deleteLeads(ids: unknown): Promise<LeadActionResult> {
  await getCurrentWorkspace();
  const parsed = leadIdsSchema.safeParse(ids);
  if (!parsed.success) return { ok: false, error: "Nothing selected." };

  const supabase = await createClient();
  // RLS limits this to the user's own workspace.
  const { error, count } = await supabase
    .from("leads")
    .delete({ count: "exact" })
    .in("id", parsed.data);
  if (error) {
    logger.error("delete leads failed", { error });
    return { ok: false, error: GENERIC_ERROR };
  }

  revalidatePath("/leads");
  revalidatePath("/dashboard");
  return { ok: true, count: count ?? 0 };
}

export async function changeLeadTags(
  ids: unknown,
  tags: unknown,
  mode: "add" | "remove",
): Promise<LeadActionResult> {
  await getCurrentWorkspace();
  const parsedIds = leadIdsSchema.safeParse(ids);
  const parsedTags = tagsSchema.safeParse(tags);
  if (!parsedIds.success) return { ok: false, error: "Nothing selected." };
  if (!parsedTags.success) return { ok: false, error: "Enter at least one tag (max 50 characters each)." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc(mode === "add" ? "add_lead_tags" : "remove_lead_tags", {
    p_lead_ids: parsedIds.data,
    p_tags: parsedTags.data,
  });
  if (error) {
    logger.error("change lead tags failed", { error, mode });
    return { ok: false, error: GENERIC_ERROR };
  }

  revalidatePath("/leads");
  revalidatePath("/leads/[id]", "page");
  return { ok: true, count: data ?? 0 };
}

// ---- Single lead page -------------------------------------------------------

const leadIdSchema = z.uuid();

function revalidateLead(id: string) {
  revalidatePath("/leads");
  revalidatePath(`/leads/${id}`);
}

export async function updateLeadContact(id: unknown, input: unknown): Promise<LeadActionResult> {
  await getCurrentWorkspace();
  const leadId = leadIdSchema.safeParse(id);
  if (!leadId.success) return { ok: false, error: "Lead not found." };
  const parsed = contactSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: z.flattenError(parsed.error).fieldErrors };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leads")
    .update(parsed.data)
    .eq("id", leadId.data)
    .select("id")
    .maybeSingle();
  if (error) {
    if (error.code === "23505") return { ok: false, fieldErrors: { email: ["Another lead already has this email."] } };
    logger.error("update lead contact failed", { error, leadId: leadId.data });
    return { ok: false, error: GENERIC_ERROR };
  }
  if (!data) return { ok: false, error: "Lead not found." };

  revalidateLead(leadId.data);
  return { ok: true };
}

export async function updateLeadNotes(id: unknown, notes: unknown): Promise<LeadActionResult> {
  await getCurrentWorkspace();
  const leadId = leadIdSchema.safeParse(id);
  if (!leadId.success) return { ok: false, error: "Lead not found." };
  const parsed = notesSchema.safeParse(notes);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };

  const supabase = await createClient();
  const { error } = await supabase.from("leads").update({ notes: parsed.data }).eq("id", leadId.data);
  if (error) {
    logger.error("update lead notes failed", { error, leadId: leadId.data });
    return { ok: false, error: GENERIC_ERROR };
  }

  revalidatePath(`/leads/${leadId.data}`);
  return { ok: true };
}

export async function updateLeadCustomFields(id: unknown, fields: unknown): Promise<LeadActionResult> {
  await getCurrentWorkspace();
  const leadId = leadIdSchema.safeParse(id);
  if (!leadId.success) return { ok: false, error: "Lead not found." };
  const parsed = customFieldsSchema.safeParse(fields);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Field names may only use lowercase letters, numbers and _ (start with a letter). Max 50 fields.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("leads")
    .update({ custom_fields: parsed.data })
    .eq("id", leadId.data);
  if (error) {
    logger.error("update lead custom fields failed", { error, leadId: leadId.data });
    return { ok: false, error: GENERIC_ERROR };
  }

  revalidateLead(leadId.data);
  return { ok: true };
}

export async function addLeadToCampaign(id: unknown, campaignId: unknown): Promise<LeadActionResult> {
  const { workspace } = await getCurrentWorkspace();
  const leadId = leadIdSchema.safeParse(id);
  const campaign = leadIdSchema.safeParse(campaignId);
  if (!leadId.success || !campaign.success) return { ok: false, error: "Choose a campaign." };

  const supabase = await createClient();
  const { data: c } = await supabase
    .from("campaigns")
    .select("id, status")
    .eq("id", campaign.data)
    .eq("workspace_id", workspace.id)
    .maybeSingle();
  if (!c) return { ok: false, error: "Campaign not found." };
  if (c.status === "completed") return { ok: false, error: "This campaign is completed." };

  const { error } = await supabase
    .from("campaign_leads")
    .insert({ workspace_id: workspace.id, campaign_id: campaign.data, lead_id: leadId.data });
  if (error) {
    if (error.code === "23505") return { ok: false, error: "This lead is already in that campaign." };
    logger.error("add lead to campaign failed", { error, leadId: leadId.data, campaignId: campaign.data });
    return { ok: false, error: GENERIC_ERROR };
  }

  revalidatePath(`/leads/${leadId.data}`);
  revalidatePath(`/campaigns/${campaign.data}`);
  return { ok: true };
}
