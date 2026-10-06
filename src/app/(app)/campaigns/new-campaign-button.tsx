"use client";

import { Loader2Icon, PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createCampaign } from "./actions";

export function NewCampaignButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          // Default the schedule to the user's own timezone.
          const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
          const res = await createCampaign({ timezone });
          if (res.ok && res.id) router.push(`/campaigns/${res.id}`);
          else toast.error(res.error ?? "Could not create the campaign.");
        })
      }
    >
      {pending ? <Loader2Icon className="animate-spin" /> : <PlusIcon />}
      New campaign
    </Button>
  );
}
