import { createHash, timingSafeEqual } from "node:crypto";
import { serverEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { runTick } from "@/lib/sending/tick";

// The background job. Supabase pg_cron calls this every minute (POST), with
//   Authorization: Bearer <CRON_SECRET>
// GET works too, so Vercel Cron could call it later. No cookies, no login:
// the secret is the only way in.
//
// It sends the emails that are due. Replies and bounces are not read here:
// Postal pushes them to us (/api/postal/inbound and /api/postal/webhook).

// Vercel Hobby allows up to 300 seconds.
export const maxDuration = 300;

function isAuthorized(request: Request): boolean {
  const header = request.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  // Hash both sides so the comparison always has the same length.
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(serverEnv().CRON_SECRET).digest();
  return timingSafeEqual(a, b);
}

async function handle(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const send = await runTick({ budgetMs: 240_000 });
    return Response.json(send);
  } catch (error) {
    logger.error("tick crashed", { error });
    return Response.json({ error: "tick_failed" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
