import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { MembersCard } from "./members-card";
import { DeleteWorkspace, RenameWorkspace } from "./workspace-forms";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { user, workspace, workspaces } = await getCurrentWorkspace();

  // Clients can't change workspace settings.
  if (!user.isAdmin) {
    return (
      <>
        <PageHeader title="Settings" description={`Settings for the workspace "${workspace.name}".`} />
        <div className="grid max-w-2xl gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{workspace.name}</CardTitle>
              <CardDescription>
                Your admin manages this workspace&apos;s name and who has access. Ask them for changes.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </>
    );
  }

  const supabase = await createClient();
  const { data: members, error } = await supabase.rpc("workspace_member_list");
  if (error) throw error;

  return (
    <>
      <PageHeader title="Settings" description={`Settings for the workspace "${workspace.name}".`} />
      <div className="grid max-w-2xl gap-6">
        <RenameWorkspace name={workspace.name} />
        <MembersCard
          currentUserId={user.id}
          members={members.map((m) => ({
            userId: m.user_id,
            email: m.email,
            isAdmin: m.is_admin,
            signedIn: m.signed_in,
          }))}
        />
        <DeleteWorkspace name={workspace.name} canDelete={workspaces.length > 1} />
      </div>
    </>
  );
}
