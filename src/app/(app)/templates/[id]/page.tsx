import { ArrowLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { getTemplateEditorData } from "../editor-data";
import { TemplateForm } from "../template-form";

export const metadata: Metadata = { title: "Template" };

export default async function TemplatePage({ params }: PageProps<"/templates/[id]">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const { workspace } = await getCurrentWorkspace();
  const supabase = await createClient();
  const [template, editorData] = await Promise.all([
    supabase.from("email_templates").select("id, name, subject, body, body_format").eq("id", id).maybeSingle(),
    getTemplateEditorData(workspace.id),
  ]);
  if (template.error) throw template.error;
  if (!template.data) notFound();

  return (
    <>
      <div className="grid gap-3">
        <Link
          href="/templates"
          className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon className="size-4" />
          Templates
        </Link>
        <h1 className="truncate text-xl font-semibold tracking-tight">{template.data.name}</h1>
      </div>
      <TemplateForm
        key={template.data.id}
        id={template.data.id}
        initial={template.data}
        {...editorData}
      />
    </>
  );
}
