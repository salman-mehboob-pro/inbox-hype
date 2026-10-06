import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { NewAccountForm } from "./new-account-form";

export const metadata: Metadata = { title: "Add email account" };

export default function NewEmailAccountPage() {
  return (
    <>
      <PageHeader
        title="Add email account"
        description="We test sending (SMTP) and reading (IMAP) before saving."
      />
      <NewAccountForm />
    </>
  );
}
