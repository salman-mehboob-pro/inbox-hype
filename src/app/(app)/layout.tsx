import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { AppSidebar } from "./app-sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, workspace } = await getCurrentWorkspace();

  // Unread replies, shown next to "Unibox". A failed count just hides the badge.
  const supabase = await createClient();
  const { count: unreadReplies } = await supabase
    .from("inbox_messages")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspace.id)
    .eq("direction", "inbound")
    .eq("is_read", false)
    .is("deleted_at", null);

  return (
    <SidebarProvider>
      <AppSidebar email={user.email} workspaceName={workspace.name} unreadReplies={unreadReplies ?? 0} />
      <SidebarInset>
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
        </header>
        <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
