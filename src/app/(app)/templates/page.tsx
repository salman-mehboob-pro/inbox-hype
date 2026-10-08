import { FileTextIcon, PlusIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { timeAgo } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { TemplateActions } from "./template-actions";

export const metadata: Metadata = { title: "Templates" };

// A short plain-text look at the email for the list.
function snippet(html: string): string {
  return html
    .replace(/<(br|\/p|\/div|\/li)[^>]*>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function NewTemplateButton() {
  return (
    <Button nativeButton={false} render={<Link href="/templates/new" />}>
      <PlusIcon />
      New template
    </Button>
  );
}

export default async function TemplatesPage() {
  const { workspace } = await getCurrentWorkspace();
  const supabase = await createClient();
  const { data: templates, error } = await supabase
    .from("email_templates")
    .select("id, name, subject, body, updated_at")
    .eq("workspace_id", workspace.id)
    .order("name");
  if (error) throw error;

  return (
    <>
      <PageHeader
        title="Templates"
        description="Saved emails you can use in any campaign sequence."
        actions={templates.length > 0 ? <NewTemplateButton /> : undefined}
      />

      {templates.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-12 text-center">
          <span className="flex size-10 items-center justify-center rounded-full bg-muted">
            <FileTextIcon className="size-5 text-muted-foreground" />
          </span>
          <div className="grid gap-1">
            <p className="font-medium">No templates yet</p>
            <p className="text-sm text-muted-foreground">
              Write an email once, then pick it in any campaign step. You can also save a step as a template.
            </p>
          </div>
          <NewTemplateButton />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="hidden md:table-cell">Subject</TableHead>
                <TableHead className="hidden lg:table-cell">Updated</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="max-w-80">
                    <Link href={`/templates/${t.id}`} className="block truncate font-medium hover:underline">
                      {t.name}
                    </Link>
                    <p className="truncate text-xs text-muted-foreground">{snippet(t.body) || "(no text yet)"}</p>
                  </TableCell>
                  <TableCell className="hidden max-w-72 truncate md:table-cell">
                    {t.subject || <span className="text-muted-foreground">(empty: replies in thread)</span>}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground lg:table-cell">{timeAgo(t.updated_at)}</TableCell>
                  <TableCell className="text-right">
                    <TemplateActions id={t.id} name={t.name} />
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
