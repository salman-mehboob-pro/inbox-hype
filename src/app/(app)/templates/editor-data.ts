import "server-only";
import type { TemplateLead, TemplateSender } from "@/lib/email/template";
import { createClient } from "@/lib/supabase/server";

// What the template editor needs: custom field names for the variable menu,
// plus a real lead and inbox for the live preview.
export async function getTemplateEditorData(workspaceId: string): Promise<{
  customKeys: string[];
  previewLead: TemplateLead | null;
  sender: TemplateSender;
}> {
  const supabase = await createClient();
  const [customKeys, lead, inbox] = await Promise.all([
    supabase.rpc("workspace_custom_field_keys", { p_workspace_id: workspaceId }),
    supabase
      .from("leads")
      .select("email, first_name, last_name, company, title, phone, website, linkedin_url, timezone, custom_fields")
      .eq("workspace_id", workspaceId)
      .order("created_at")
      .limit(1)
      .maybeSingle(),
    supabase
      .from("email_accounts")
      .select("email, from_name")
      .eq("workspace_id", workspaceId)
      .order("created_at")
      .limit(1)
      .maybeSingle(),
  ]);
  if (customKeys.error) throw customKeys.error;
  if (lead.error) throw lead.error;
  if (inbox.error) throw inbox.error;

  const cf = lead.data?.custom_fields;
  return {
    customKeys: (customKeys.data ?? []).map((k) => k.key),
    previewLead: lead.data
      ? {
          ...lead.data,
          custom_fields: cf && typeof cf === "object" && !Array.isArray(cf) ? (cf as Record<string, unknown>) : {},
        }
      : null,
    sender: inbox.data ? { name: inbox.data.from_name, email: inbox.data.email } : {},
  };
}
