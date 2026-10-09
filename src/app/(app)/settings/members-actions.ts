"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { publicEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";

// People with access to the open workspace (admin only). A client is added by
// email; a new account gets a one-time login link the admin sends them
// (Supabase's own mailer only reaches our team, so we don't email it).

export type MemberActionResult = {
  ok: boolean;
  error?: string;
  // Login link for someone who never logged in (or a password reset link).
  link?: string;
  // The account existed already and can log in with its own password.
  existingAccount?: boolean;
  alreadyMember?: boolean;
};

const GENERIC_ERROR = "Something went wrong. Please try again.";
const ADMIN_ONLY = "Only an admin can do this.";
const emailSchema = z.email("Enter a valid email").trim().toLowerCase();
const idSchema = z.uuid();

// A one-time link that logs the person in and opens "set your password".
async function loginLink(email: string, welcome: boolean): Promise<string> {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email });
  if (error) throw error;
  const next = welcome ? "/reset-password?welcome=1" : "/reset-password";
  const params = new URLSearchParams({ token_hash: data.properties.hashed_token, type: "recovery", next });
  return `${publicEnv.NEXT_PUBLIC_APP_URL}/auth/callback?${params}`;
}

export async function inviteMember(input: unknown): Promise<MemberActionResult> {
  const { user, workspace } = await getCurrentWorkspace();
  if (!user.isAdmin) return { ok: false, error: ADMIN_ONLY };
  const parsed = emailSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const email = parsed.data;

  const admin = createAdminClient();
  const supabase = await createClient();
  try {
    const { data: found, error: findError } = await admin.rpc("find_user_id_by_email", { p_email: email });
    if (findError) throw findError;

    let userId = found;
    let created = false;
    if (!userId) {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { invited: true },
      });
      if (error) throw error;
      userId = data.user.id;
      created = true;
    }

    // Runs as the admin: the database checks the admin rights and the workspace.
    const { data: added, error: addError } = await supabase.rpc("add_workspace_member", { p_user_id: userId });
    if (addError) {
      if (created) await admin.auth.admin.deleteUser(userId);
      if (addError.code === "42501") return { ok: false, error: ADMIN_ONLY };
      throw addError;
    }

    const { data: account, error: accountError } = await admin.auth.admin.getUserById(userId);
    if (accountError) throw accountError;
    const neverLoggedIn = !account.user.last_sign_in_at;

    logger.info("workspace member invited", { workspaceId: workspace.id, created, added });
    revalidatePath("/settings");
    return {
      ok: true,
      link: neverLoggedIn ? await loginLink(email, true) : undefined,
      existingAccount: !neverLoggedIn,
      alreadyMember: !added,
    };
  } catch (error) {
    logger.error("invite member failed", { error, workspaceId: workspace.id });
    return { ok: false, error: GENERIC_ERROR };
  }
}

// A fresh login link for someone in this workspace: first login (invite) or a
// forgotten password.
export async function createLoginLink(userId: unknown): Promise<MemberActionResult> {
  const { user, workspace } = await getCurrentWorkspace();
  if (!user.isAdmin) return { ok: false, error: ADMIN_ONLY };
  const parsed = idSchema.safeParse(userId);
  if (!parsed.success) return { ok: false, error: "Person not found." };

  const supabase = await createClient();
  const { data: members, error } = await supabase.rpc("workspace_member_list");
  if (error) {
    logger.error("member list failed", { error, workspaceId: workspace.id });
    return { ok: false, error: GENERIC_ERROR };
  }
  const member = members.find((m) => m.user_id === parsed.data);
  if (!member || member.user_id === user.id) return { ok: false, error: "Person not found." };

  try {
    return { ok: true, link: await loginLink(member.email, !member.signed_in) };
  } catch (err) {
    logger.error("login link failed", { error: err, workspaceId: workspace.id });
    return { ok: false, error: GENERIC_ERROR };
  }
}

export async function removeMember(userId: unknown): Promise<MemberActionResult> {
  const { user, workspace } = await getCurrentWorkspace();
  if (!user.isAdmin) return { ok: false, error: ADMIN_ONLY };
  const parsed = idSchema.safeParse(userId);
  if (!parsed.success) return { ok: false, error: "Person not found." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_workspace_member", { p_user_id: parsed.data });
  if (error) {
    if (error.code === "22023") return { ok: false, error: "You can't remove yourself." };
    if (error.code === "42501") return { ok: false, error: ADMIN_ONLY };
    logger.error("remove member failed", { error, workspaceId: workspace.id });
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidatePath("/settings");
  return { ok: true };
}
