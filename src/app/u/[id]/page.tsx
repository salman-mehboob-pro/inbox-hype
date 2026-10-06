import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Logo } from "@/components/logo";
import { createAdminClient } from "@/lib/supabase/admin";
import { UnsubscribeButton } from "./unsubscribe-button";

export const metadata: Metadata = {
  title: "Unsubscribe",
  robots: { index: false, follow: false },
};

// ann.lee@acme.com -> a***@acme.com (the page is reached from a forwarded email too)
function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  return `${local.slice(0, 1)}***@${domain}`;
}

// Public page (no login). Opening it never unsubscribes anyone: mail security
// tools open every link in an email. The person confirms with the button.
export default async function UnsubscribePage({ params }: PageProps<"/u/[id]">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const { data, error } = await createAdminClient().rpc("unsubscribe_info", { p_sent_message_id: id });
  if (error) throw error;
  const info = data[0];
  if (!info) notFound();

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-8 p-6">
      <Logo className="text-lg" />
      <div className="w-full rounded-xl border bg-card p-8 shadow-sm">
        <UnsubscribeButton
          id={id}
          email={maskEmail(info.out_email)}
          sender={info.out_sender}
          alreadyDone={info.out_already}
        />
      </div>
    </main>
  );
}
