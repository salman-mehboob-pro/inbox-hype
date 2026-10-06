import { after } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { PIXEL_PNG } from "@/lib/sending/tracking";
import { createAdminClient } from "@/lib/supabase/admin";

// Open tracking: the 1x1 image at the end of an email. Public (no login).
// The image is ALWAYS returned, even when something fails, so a tracking problem
// can never show a broken image in the lead's inbox.

const headers = {
  "Content-Type": "image/png",
  "Content-Length": String(PIXEL_PNG.length),
  // Every open must reach us, so nothing may be cached.
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
};

function pixel() {
  return new Response(new Uint8Array(PIXEL_PNG), { headers });
}

export async function GET(request: Request, ctx: RouteContext<"/o/[id]">) {
  const { id: raw } = await ctx.params;
  const id = raw.replace(/\.png$/i, "");
  const userAgent = request.headers.get("user-agent")?.slice(0, 120) ?? "";

  if (z.uuid().safeParse(id).success) {
    // After the response is sent, so the image is not slowed down.
    after(async () => {
      const { error } = await createAdminClient().rpc("record_open", {
        p_sent_message_id: id,
        p_meta: { ua: userAgent },
      });
      if (error) logger.error("record open failed", { error, id });
    });
  }
  return pixel();
}

// A HEAD request (link checkers) must not count as an open.
export async function HEAD() {
  return pixel();
}
