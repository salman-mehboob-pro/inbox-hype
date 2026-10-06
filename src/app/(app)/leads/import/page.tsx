import { ArrowLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { ImportWizard } from "./import-wizard";

export const metadata: Metadata = { title: "Import leads" };

export default function ImportLeadsPage() {
  return (
    <>
      <div className="grid gap-3">
        <Link
          href="/leads"
          className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon className="size-4" />
          Leads
        </Link>
        <PageHeader title="Import leads" description="Upload a CSV, match the columns, review, then import." />
      </div>
      <ImportWizard />
    </>
  );
}
