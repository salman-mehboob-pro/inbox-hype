import { createHash, timingSafeEqual } from "node:crypto";
import { serverEnv } from "@/lib/env";
import { runInboxSync } from "@/lib/inbox/sync";
import { logger } from "@/lib/logger";
import { runTick } from "@/lib/sending/tick";

// The background job. Supabase pg_cron calls this every minute (POST), with
//   Authorization: Bearer <CRON_SECRET>
// GET works too, so Vercel Cron could call it later. No cookies, no login:
// the secret is the only way in.
//
// Each run does two things, in this order:
//   1. read new replies / bounces from the inboxes (IMAP)
//   2. send the emails that are due
// Reading first means a lead who just answered is never sent a follow-up.

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

  const started = Date.now();
  let sync = null;
  try {
    sync = await runInboxSync({ budgetMs: 80_000 });
  } catch (error) {
    // Never let a mail-reading problem stop the sending of new leads.
    logger.error("inbox sync crashed", { error });
  }

  try {
    // The rest of the 300 s (minus a safety margin) is for sending.
    const send = await runTick({ budgetMs: Math.max(30_000, 240_000 - (Date.now() - started)) });
    return Response.json({ ...send, sync });
  } catch (error) {
    logger.error("tick crashed", { error });
    return Response.json({ error: "tick_failed", sync }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
