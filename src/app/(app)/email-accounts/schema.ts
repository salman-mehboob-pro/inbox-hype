import { z } from "zod";
import { normalizePostalUrl } from "@/lib/postal/core";

const sendingSettings = {
  fromName: z.string().trim().max(100, "Max 100 characters").default(""),
  dailyLimit: z.coerce.number().int().min(1, "At least 1").max(500, "At most 500"),
};

// A Postal inbox: sends through the Postal HTTP API.
export const createAccountSchema = z.object({
  email: z.email("Enter a valid email").trim().toLowerCase(),
  apiUrl: z
    .string()
    .max(300)
    .transform((value, ctx) => {
      const url = normalizePostalUrl(value);
      if (!url) {
        ctx.addIssue({ code: "custom", message: "Enter your Postal address, like https://postal.example.com" });
        return z.NEVER;
      }
      return url;
    }),
  apiKey: z.string().trim().min(1, "Required").max(200),
  ...sendingSettings,
});

export type CreateAccountInput = z.input<typeof createAccountSchema>;

export const settingsSchema = z.object({
  ...sendingSettings,
  signature: z.string().max(5000, "Max 5000 characters").default(""),
});

export type SettingsInput = z.input<typeof settingsSchema>;

export const apiKeySchema = z.object({
  apiKey: z.string().trim().min(1, "Required").max(200),
});

export type ApiKeyInput = z.input<typeof apiKeySchema>;
