import { ArrowLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentWorkspace } from "@/lib/workspace";
import { getTemplateEditorData } from "../editor-data";
import { TemplateForm } from "../template-form";

export const metadata: Metadata = { title: "New template" };

export default async function NewTemplatePage() {
  const { workspace } = await getCurrentWorkspace();
  const editorData = await getTemplateEditorData(workspace.id);

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
        <h1 className="text-xl font-semibold tracking-tight">New template</h1>
      </div>
      <TemplateForm {...editorData} />
    </>
  );
}
