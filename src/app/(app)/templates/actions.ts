"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { templateSchema, type TemplateOption } from "./schema";

export type TemplateActionResult = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  template?: TemplateOption;
};

const GENERIC_ERROR = "Something went wrong. Please try again.";
const NAME_TAKEN = "A template with this name already exists.";
const idSchema = z.uuid();

function refresh(id?: string) {
  revalidatePath("/templates");
  if (id) revalidatePath(`/templates/${id}`);
}

// Loads a template only if it belongs to the open workspace (RLS enforces it).
async function getOwnedTemplate(id: unknown) {
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("email_templates")
    .select("id, workspace_id, name, subject, body, body_format")
    .eq("id", parsed.data)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function createTemplate(input: unknown): Promise<TemplateActionResult> {
  const { workspace } = await getCurrentWorkspace();
  const parsed = templateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: z.flattenError(parsed.error).fieldErrors };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("email_templates")
    .insert({ workspace_id: workspace.id, ...parsed.data })
    .select("id, name, subject, body, body_format")
    .single();
  if (error) {
    if (error.code === "23505") return { ok: false, fieldErrors: { name: [NAME_TAKEN] }, error: NAME_TAKEN };
    logger.error("create template failed", { error, workspaceId: workspace.id });
    return { ok: false, error: GENERIC_ERROR };
  }
  refresh();
  return { ok: true, template: data };
}

export async function saveTemplate(id: string, input: unknown): Promise<TemplateActionResult> {
  const template = await getOwnedTemplate(id);
  if (!template) return { ok: false, error: "Template not found." };
  const parsed = templateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: z.flattenError(parsed.error).fieldErrors };

  const supabase = await createClient();
  const { error } = await supabase.from("email_templates").update(parsed.data).eq("id", template.id);
  if (error) {
    if (error.code === "23505") return { ok: false, fieldErrors: { name: [NAME_TAKEN] }, error: NAME_TAKEN };
    logger.error("save template failed", { error, templateId: template.id });
    return { ok: false, error: GENERIC_ERROR };
  }
  refresh(template.id);
  return { ok: true };
}

export async function duplicateTemplate(id: string): Promise<TemplateActionResult> {
  const template = await getOwnedTemplate(id);
  if (!template) return { ok: false, error: "Template not found." };

  const supabase = await createClient();
  // "Name (copy)", then "Name (copy 2)", … until the name is free.
  const base = template.name.slice(0, 185);
  for (let n = 1; n <= 20; n++) {
    const name = n === 1 ? `${base} (copy)` : `${base} (copy ${n})`;
    const { error } = await supabase.from("email_templates").insert({
      workspace_id: template.workspace_id,
      name,
      subject: template.subject,
      body: template.body,
      body_format: template.body_format,
    });
    if (!error) {
      refresh();
      return { ok: true };
    }
    if (error.code !== "23505") {
      logger.error("duplicate template failed", { error, templateId: template.id });
      return { ok: false, error: GENERIC_ERROR };
    }
  }
  return { ok: false, error: "Too many copies. Rename some first." };
}

export async function deleteTemplate(id: string): Promise<TemplateActionResult> {
  const template = await getOwnedTemplate(id);
  if (!template) return { ok: false, error: "Template not found." };

  const supabase = await createClient();
  const { error } = await supabase.from("email_templates").delete().eq("id", template.id);
  if (error) {
    logger.error("delete template failed", { error, templateId: template.id });
    return { ok: false, error: GENERIC_ERROR };
  }
  refresh();
  return { ok: true };
}
