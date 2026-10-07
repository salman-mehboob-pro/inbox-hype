import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { NewAccountForm } from "./new-account-form";

export const metadata: Metadata = { title: "Add email account" };

export default function NewEmailAccountPage() {
  return (
    <>
      <PageHeader
        title="Add email account"
        description="Connect a sender address of your Postal server. We check it before saving."
      />
      <NewAccountForm />
    </>
  );
}
