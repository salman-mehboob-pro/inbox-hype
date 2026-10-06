"use server";

import { z } from "zod";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

export type UnsubscribeResult = { ok: boolean; error?: string };

// The "Unsubscribe" button on the public page. The page is reached from an
// email link, so there is no login: the unguessable message id is the proof.
export async function confirmUnsubscribe(id: string): Promise<UnsubscribeResult> {
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "This link is not valid." };

  const { data, error } = await createAdminClient().rpc("unsubscribe_by_message", { p_sent_message_id: id });
  if (error) {
    logger.error("unsubscribe failed", { error, id });
    return { ok: false, error: "Something went wrong. Please try again." };
  }
  if (data?.[0]?.out_result === "not_found") return { ok: false, error: "This link is not valid." };
  return { ok: true };
}
