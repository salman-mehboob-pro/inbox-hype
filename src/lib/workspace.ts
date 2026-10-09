import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

// The logged-in user, their open workspace and all workspaces they may open
// (for the switcher). Cached per request. The database decides which workspace
// is open (`user_settings`), and RLS only shows that one.
// Admins (Buildberg) may open every workspace; clients only their own.
export const getCurrentWorkspace = cache(async () => {
  const supabase = await createClient();

  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;
  if (!claims) redirect("/login");

  const [{ data: workspaces, error }, { data: isAdmin, error: adminError }] = await Promise.all([
    supabase.rpc("my_workspaces"),
    supabase.rpc("is_app_admin"),
  ]);
  if (error) throw error;
  if (adminError) throw adminError;

  // No workspace yet (or access removed): nothing to show.
  const active = workspaces?.find((w) => w.is_active);
  if (!active) redirect("/no-access");

  const { data: workspace, error: wsError } = await supabase
    .from("workspaces")
    .select("id, name, timezone")
    .eq("id", active.id)
    .maybeSingle();
  if (wsError) throw wsError;
  if (!workspace) redirect("/no-access");

  return {
    user: { id: claims.sub, email: typeof claims.email === "string" ? claims.email : "", isAdmin: Boolean(isAdmin) },
    workspace: { ...workspace, role: active.role },
    workspaces: workspaces.map((w) => ({ id: w.id, name: w.name, isActive: w.is_active })),
  };
});
