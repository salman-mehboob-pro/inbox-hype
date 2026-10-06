import { NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

// One-click unsubscribe (RFC 8058). Gmail, Yahoo and others show an
// "Unsubscribe" button next to the sender and POST to this address when it is
// pressed. Public (no login). The page people see is /u/<id>.

export async function POST(_request: Request, ctx: RouteContext<"/u/[id]/one-click">) {
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return new Response("Not found", { status: 404 });

  const { data, error } = await createAdminClient().rpc("unsubscribe_by_message", { p_sent_message_id: id });
  if (error) {
    logger.error("one-click unsubscribe failed", { error, id });
    return new Response("Something went wrong. Please try again.", { status: 500 });
  }
  if (data?.[0]?.out_result === "not_found") return new Response("Not found", { status: 404 });
  return new Response("You are unsubscribed.", { status: 200 });
}

// Someone opened this address in a browser: show the normal page.
export async function GET(request: Request, ctx: RouteContext<"/u/[id]/one-click">) {
  const { id } = await ctx.params;
  return NextResponse.redirect(new URL(`/u/${id}`, request.url), 302);
}
