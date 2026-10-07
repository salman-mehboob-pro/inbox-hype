"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";

export type WorkspaceActionResult = { ok: boolean; error?: string };

const GENERIC_ERROR = "Something went wrong. Please try again.";
const idSchema = z.uuid();
const nameSchema = z
  .string()
  .trim()
  .min(1, "Give the workspace a name.")
  .max(100, "The name is too long (max 100 characters).");

// Every page shows the open workspace, so after a change all of them reload.
function refreshAll() {
  revalidatePath("/", "layout");
}

export async function switchWorkspace(id: string): Promise<WorkspaceActionResult> {
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return { ok: false, error: "Workspace not found." };
  await getCurrentWorkspace();
  const supabase = await createClient();

  const { error } = await supabase.rpc("switch_workspace", { p_workspace_id: parsed.data });
  if (error) {
    if (error.code === "P0002") return { ok: false, error: "Workspace not found." };
    logger.error("switch workspace failed", { error });
    return { ok: false, error: GENERIC_ERROR };
  }
  refreshAll();
  return { ok: true };
}

export async function createWorkspace(name: unknown): Promise<WorkspaceActionResult> {
  const parsed = nameSchema.safeParse(name);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const { user } = await getCurrentWorkspace();
  const supabase = await createClient();

  const { error } = await supabase.rpc("create_workspace", { p_name: parsed.data });
  if (error) {
    if (error.code === "54000") return { ok: false, error: "You have reached the limit of 50 workspaces." };
    logger.error("create workspace failed", { error, userId: user.id });
    return { ok: false, error: GENERIC_ERROR };
  }
  logger.info("workspace created", { userId: user.id });
  refreshAll();
  return { ok: true };
}

export async function renameWorkspace(name: unknown): Promise<WorkspaceActionResult> {
  const parsed = nameSchema.safeParse(name);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const { workspace } = await getCurrentWorkspace();
  const supabase = await createClient();

  // RLS: only the open workspace can be changed.
  const { error } = await supabase.from("workspaces").update({ name: parsed.data }).eq("id", workspace.id);
  if (error) {
    logger.error("rename workspace failed", { error, workspaceId: workspace.id });
    return { ok: false, error: GENERIC_ERROR };
  }
  refreshAll();
  return { ok: true };
}

// Deletes the OPEN workspace with everything in it. The user then lands in
// their oldest remaining workspace.
export async function deleteWorkspace(confirmName: unknown): Promise<WorkspaceActionResult> {
  const { workspace, workspaces } = await getCurrentWorkspace();
  if (workspace.role !== "owner") return { ok: false, error: "Only the owner can delete this workspace." };
  if (workspaces.length <= 1) return { ok: false, error: "You can't delete your only workspace." };
  if (typeof confirmName !== "string" || confirmName.trim() !== workspace.name) {
    return { ok: false, error: "Type the workspace name exactly to confirm." };
  }
  const supabase = await createClient();

  const { error } = await supabase.rpc("delete_workspace", { p_workspace_id: workspace.id });
  if (error) {
    if (error.code === "22023") return { ok: false, error: "You can't delete your only workspace." };
    logger.error("delete workspace failed", { error, workspaceId: workspace.id });
    return { ok: false, error: GENERIC_ERROR };
  }
  logger.info("workspace deleted", { workspaceId: workspace.id });
  refreshAll();
  return { ok: true };
}
