import { logger } from "@/lib/logger";
import { isHookToken } from "@/lib/postal/core";
import { handlePostalInbound } from "@/lib/postal/hooks";

// Postal route (HTTP endpoint): Postal POSTs every email sent to the user's
// addresses here, as the raw message (JSON, base64). Replies, out-of-office and
// bounce reports for our emails are saved; anything else is ignored. Public
// URL; the secret token in the path is the only way in. A non-2xx answer makes
// Postal try again later, so we only answer 500 when we could not save it.

export const maxDuration = 60;

// Vercel refuses request bodies over about 4.5 MB before they reach us.
const MAX_BODY_BYTES = 20_000_000;

export async function POST(request: Request, ctx: RouteContext<"/api/postal/inbound/[token]">) {
  const { token } = await ctx.params;
  if (!isHookToken(token)) return Response.json({ error: "not_found" }, { status: 404 });

  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) return Response.json({ error: "too_large" }, { status: 413 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "bad_json" }, { status: 400 });
  }

  try {
    const { status, result } = await handlePostalInbound(token, body);
    return Response.json({ result }, { status });
  } catch (error) {
    logger.error("postal inbound failed", { error });
    return Response.json({ error: "failed" }, { status: 500 });
  }
}
