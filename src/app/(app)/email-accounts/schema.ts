import { z } from "zod";
import { PROVIDERS } from "@/lib/email/providers";

const hostname = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Required")
  .max(253)
  .regex(/^[a-z0-9.-]+$/, "Enter a host name like smtp.example.com");

const port = z.coerce.number().int().min(1, "Invalid port").max(65535, "Invalid port");

const sendingSettings = {
  fromName: z.string().trim().max(100, "Max 100 characters").default(""),
  dailyLimit: z.coerce.number().int().min(1, "At least 1").max(500, "At most 500"),
};

export const createAccountSchema = z
  .object({
    provider: z.enum(PROVIDERS),
    email: z.email("Enter a valid email").trim().toLowerCase(),
    password: z.string().min(1, "Required").max(500),
    smtpHost: hostname,
    smtpPort: port,
    smtpSecure: z.boolean(),
    smtpUsername: z.string().trim().min(1, "Required").max(320),
    imapEnabled: z.boolean(),
    imapHost: z.string().optional(),
    imapPort: z.coerce.number().optional(),
    imapSecure: z.boolean(),
    imapUsername: z.string().trim().max(320).optional(),
    // Blank = same password as SMTP.
    imapPassword: z.string().max(500).optional(),
    ...sendingSettings,
  })
  .superRefine((v, ctx) => {
    if (!v.imapEnabled) return;
    if (!hostname.safeParse(v.imapHost ?? "").success) {
      ctx.addIssue({ code: "custom", path: ["imapHost"], message: "Enter a host name like imap.example.com" });
    }
    if (!port.safeParse(v.imapPort).success) {
      ctx.addIssue({ code: "custom", path: ["imapPort"], message: "Invalid port" });
    }
    if (!v.imapUsername) {
      ctx.addIssue({ code: "custom", path: ["imapUsername"], message: "Required" });
    }
  });

export type CreateAccountInput = z.input<typeof createAccountSchema>;

export const settingsSchema = z.object({
  ...sendingSettings,
  signature: z.string().max(5000, "Max 5000 characters").default(""),
});

export type SettingsInput = z.input<typeof settingsSchema>;

export const passwordSchema = z.object({
  password: z.string().min(1, "Required").max(500),
  imapPassword: z.string().max(500).optional(),
});

export type PasswordInput = z.input<typeof passwordSchema>;

// Gmail shows app passwords as "abcd efgh ijkl mnop"; spaces are not part of it.
export function normalizePassword(provider: string, password: string) {
  return provider === "gmail" ? password.replace(/\s+/g, "") : password;
}
