import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

// The logged-in user and their workspace. Cached per request.
// v1: one workspace per user (created at signup).
export const getCurrentWorkspace = cache(async () => {
  const supabase = await createClient();

  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;
  if (!claims) redirect("/login");

  const { data: workspace, error } = await supabase
    .from("workspaces")
    .select("id, name, timezone")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!workspace) throw new Error("No workspace found for this user");

  return {
    user: { id: claims.sub, email: typeof claims.email === "string" ? claims.email : "" },
    workspace,
  };
});
