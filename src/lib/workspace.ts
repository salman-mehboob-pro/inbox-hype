import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

// The logged-in user, their open workspace and all their workspaces (for the
// switcher). Cached per request. The database decides which workspace is open
// (`user_settings`), and RLS only shows that one.
export const getCurrentWorkspace = cache(async () => {
  const supabase = await createClient();

  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;
  if (!claims) redirect("/login");

  const { data: workspaces, error } = await supabase.rpc("my_workspaces");
  if (error) throw error;

  const active = workspaces?.find((w) => w.is_active);
  if (!active) throw new Error("No workspace found for this user");

  const { data: workspace, error: wsError } = await supabase
    .from("workspaces")
    .select("id, name, timezone")
    .eq("id", active.id)
    .maybeSingle();
  if (wsError) throw wsError;
  if (!workspace) throw new Error("No workspace found for this user");

  return {
    user: { id: claims.sub, email: typeof claims.email === "string" ? claims.email : "" },
    workspace: { ...workspace, role: active.role },
    workspaces: workspaces.map((w) => ({ id: w.id, name: w.name, isActive: w.is_active })),
  };
});
