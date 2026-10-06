// Runs the sending tick against the local app (stands in for Supabase pg_cron).
//
//   npm run tick           one tick
//   npm run tick:watch     one tick every 60 seconds (like pg_cron)
//   node --env-file=.env.local scripts/tick.mjs --watch --every=20   faster, for testing
//
// Needs the dev server running (npm run dev). Reads CRON_SECRET and
// NEXT_PUBLIC_APP_URL from .env.local (loaded by `node --env-file`).

const secret = process.env.CRON_SECRET;
const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/, "");
const watch = process.argv.includes("--watch");
const everyArg = process.argv.find((a) => a.startsWith("--every="));
const everySeconds = Math.max(5, Number(everyArg?.split("=")[1]) || 60);

if (!secret) {
  console.error("CRON_SECRET is missing. Run this with: node --env-file=.env.local scripts/tick.mjs");
  process.exit(1);
}

async function tick() {
  const started = new Date().toLocaleTimeString();
  try {
    const response = await fetch(`${baseUrl}/api/cron/tick`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}` },
    });
    const body = await response.text();
    console.log(`[${started}] ${response.status} ${body}`);
  } catch (error) {
    console.error(`[${started}] could not reach ${baseUrl}: ${error.message}`);
  }
}

await tick();
if (watch) {
  console.log(`Watching: one tick every ${everySeconds} seconds. Press Ctrl+C to stop.`);
  setInterval(tick, everySeconds * 1000);
}
