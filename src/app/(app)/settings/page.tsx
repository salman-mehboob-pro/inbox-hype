import type { Metadata } from "next";
import { ComingSoon, PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" description="Workspace and account settings." />
      <ComingSoon step="a later step" />
    </>
  );
}
