import { MailIcon, PlusIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { timeAgo } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { AccountActions } from "./account-actions";
import { AccountStatusBadge } from "./status-badge";

export const metadata: Metadata = { title: "Email accounts" };

export default async function EmailAccountsPage() {
  const { workspace } = await getCurrentWorkspace();
  const supabase = await createClient();
  const { data: accounts, error } = await supabase
    .from("email_accounts")
    .select(
      "id, email, from_name, status, daily_limit, last_tested_at, last_error, postal_server:postal_servers(api_url, route_ok_at)",
    )
    .eq("workspace_id", workspace.id)
    .order("created_at", { ascending: true });
  if (error) throw error;

  const addButton = (
    <Button nativeButton={false} render={<Link href="/email-accounts/new" />}>
      <PlusIcon />
      Add email account
    </Button>
  );

  return (
    <>
      <PageHeader
        title="Email accounts"
        description="Inboxes that send your campaigns and receive replies."
        actions={accounts.length > 0 ? addButton : undefined}
      />

      {accounts.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-12 text-center">
          <span className="flex size-10 items-center justify-center rounded-full bg-muted">
            <MailIcon className="size-5 text-muted-foreground" />
          </span>
          <div className="grid gap-1">
            <p className="font-medium">No email accounts yet</p>
            <p className="text-sm text-muted-foreground">
              Connect a sender address of your Postal server to start sending.
            </p>
          </div>
          {addButton}
        </div>
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead className="hidden md:table-cell">Postal server</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden sm:table-cell text-right">Daily limit</TableHead>
                <TableHead className="hidden md:table-cell">Replies</TableHead>
                <TableHead className="hidden lg:table-cell">Last tested</TableHead>
                <TableHead className="w-10">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="max-w-64">
                    <Link href={`/email-accounts/${a.id}`} className="grid hover:underline">
                      <span className="truncate font-medium">{a.email}</span>
                      {a.from_name && (
                        <span className="truncate text-xs text-muted-foreground">{a.from_name}</span>
                      )}
                    </Link>
                    {a.status === "error" && a.last_error && (
                      <p className="mt-1 text-xs whitespace-normal text-destructive">{a.last_error}</p>
                    )}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {a.postal_server ? new URL(a.postal_server.api_url).host : "—"}
                  </TableCell>
                  <TableCell>
                    <AccountStatusBadge status={a.status} />
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-right tabular-nums">{a.daily_limit}</TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground">
                    {a.postal_server?.route_ok_at ? "Postal route" : a.postal_server ? "Setup needed" : "—"}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-muted-foreground">
                    {timeAgo(a.last_tested_at)}
                  </TableCell>
                  <TableCell>
                    <AccountActions id={a.id} email={a.email} status={a.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
