import { after } from "next/server";
import { z } from "zod";
import { serverEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { deriveTrackingKey, verifyClick } from "@/lib/sending/tracking";
import { createAdminClient } from "@/lib/supabase/admin";

// Click tracking: /c/<sent message id>?u=<link>&s=<signature>. Public (no login).
// Only links we signed ourselves when sending are followed. Without the
// signature this route would let anyone send people to any website through our
// domain (an "open redirect").

function resolve(request: Request, id: string): string | null {
  if (!z.uuid().safeParse(id).success) return null;
  const params = new URL(request.url).searchParams;
  const url = params.get("u") ?? "";
  const signature = params.get("s") ?? "";
  if (url.length === 0 || url.length > 2000 || !/^https?:\/\//i.test(url)) return null;
  const key = deriveTrackingKey(serverEnv().ENCRYPTION_KEY);
  return verifyClick(key, id, url, signature) ? url : null;
}

export async function GET(request: Request, ctx: RouteContext<"/c/[id]">) {
  const { id } = await ctx.params;
  const url = resolve(request, id);
  if (!url) return new Response("This link is not valid.", { status: 400 });

  // Count the click after the redirect is on its way. A counting problem must
  // never stop the person from reaching the page.
  after(async () => {
    const { error } = await createAdminClient().rpc("record_click", {
      p_sent_message_id: id,
      p_url: url,
      p_meta: { ua: request.headers.get("user-agent")?.slice(0, 120) ?? "" },
    });
    if (error) logger.error("record click failed", { error, id });
  });
  return Response.redirect(url, 302);
}

// A HEAD request (link checkers) must not count as a click.
export async function HEAD(request: Request, ctx: RouteContext<"/c/[id]">) {
  const { id } = await ctx.params;
  const url = resolve(request, id);
  return url ? Response.redirect(url, 302) : new Response(null, { status: 400 });
}
