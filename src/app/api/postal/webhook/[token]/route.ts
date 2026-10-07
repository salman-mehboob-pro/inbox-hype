import { logger } from "@/lib/logger";
import { isHookToken } from "@/lib/postal/core";
import { handlePostalWebhook } from "@/lib/postal/hooks";

// Postal webhook: Postal POSTs here what happened to the emails we sent
// (delivered, delayed, failed, held, bounced) and DNS problems. Public URL; the
// secret token in the path is the only way in. Any non-2xx answer makes Postal
// try again later, so we only answer 500 when we could not save the event.

const MAX_BODY_BYTES = 1_000_000;

export async function POST(request: Request, ctx: RouteContext<"/api/postal/webhook/[token]">) {
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
    const { status, result } = await handlePostalWebhook(token, body);
    return Response.json({ result }, { status });
  } catch (error) {
    logger.error("postal webhook failed", { error });
    return Response.json({ error: "failed" }, { status: 500 });
  }
}
