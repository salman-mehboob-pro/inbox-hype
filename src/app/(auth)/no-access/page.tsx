import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { logout } from "../actions";

export const metadata: Metadata = { title: "No access" };

// A logged-in account without any workspace (new, or access was removed).
export default async function NoAccessPage() {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims) redirect("/login");

  const { data: workspaces } = await supabase.rpc("my_workspaces");
  if (workspaces?.some((w) => w.is_active)) redirect("/dashboard");

  const email = typeof claimsData.claims.email === "string" ? claimsData.claims.email : "";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">No workspace yet</CardTitle>
        <CardDescription>
          {email ? `${email} is` : "Your account is"} not part of any workspace. Ask your admin to give you access, then
          log in again.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={logout}>
          <Button type="submit" variant="outline" className="w-full">
            Log out
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
