import { z } from "zod";

// Public env vars must be referenced as literal process.env.NEXT_PUBLIC_* so
// Next.js can inline them into the browser bundle.
const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.url(),
});

export const publicEnv = publicSchema.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
});

const serverSchema = z.object({
  SUPABASE_SECRET_KEY: z.string().min(1, "SUPABASE_SECRET_KEY is missing in .env.local"),
  ENCRYPTION_KEY: z
    .string()
    .refine((v) => Buffer.from(v, "base64").length === 32, "ENCRYPTION_KEY must be 32 bytes, base64"),
  CRON_SECRET: z.string().min(32, "CRON_SECRET must be at least 32 characters"),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cachedServerEnv: ServerEnv | undefined;

// Server-only secrets. Read lazily so pages that don't need them still work.
export function serverEnv(): ServerEnv {
  if (typeof window !== "undefined") {
    throw new Error("serverEnv() must not be called in the browser");
  }
  cachedServerEnv ??= serverSchema.parse(process.env);
  return cachedServerEnv;
}
