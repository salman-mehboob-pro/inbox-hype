import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { getCurrentWorkspace } from "@/lib/workspace";
import { DeleteWorkspace, RenameWorkspace } from "./workspace-forms";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { workspace, workspaces } = await getCurrentWorkspace();
  const canDelete = workspace.role === "owner" && workspaces.length > 1;

  return (
    <>
      <PageHeader title="Settings" description={`Settings for the workspace "${workspace.name}".`} />
      <div className="grid max-w-2xl gap-6">
        <RenameWorkspace name={workspace.name} />
        <DeleteWorkspace name={workspace.name} canDelete={canDelete} />
      </div>
    </>
  );
}
