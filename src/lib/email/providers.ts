// Preset SMTP/IMAP settings per provider. "secure" = TLS from the start
// (ports 465/993). When false we require STARTTLS.

export const PROVIDERS = ["gmail", "outlook", "yahoo", "zoho", "postal", "custom"] as const;
export type Provider = (typeof PROVIDERS)[number];

export type ProviderPreset = {
  label: string;
  smtp: { host: string; port: number; secure: boolean } | null;
  imap: { host: string; port: number; secure: boolean } | null;
  // Postal is send-only: replies are read from another inbox.
  supportsImap: boolean;
  recommendedDailyLimit: number;
  help: string;
};

export const PROVIDER_PRESETS: Record<Provider, ProviderPreset> = {
  gmail: {
    label: "Gmail / Google Workspace",
    smtp: { host: "smtp.gmail.com", port: 465, secure: true },
    imap: { host: "imap.gmail.com", port: 993, secure: true },
    supportsImap: true,
    recommendedDailyLimit: 30,
    help: "Use a 16-letter app password (myaccount.google.com/apppasswords). 2-Step Verification must be on.",
  },
  outlook: {
    label: "Outlook / Microsoft 365",
    smtp: { host: "smtp.office365.com", port: 587, secure: false },
    imap: { host: "outlook.office365.com", port: 993, secure: true },
    supportsImap: true,
    recommendedDailyLimit: 30,
    help: "Use an app password. Some Microsoft 365 tenants block password login (SMTP AUTH off).",
  },
  yahoo: {
    label: "Yahoo Mail",
    smtp: { host: "smtp.mail.yahoo.com", port: 465, secure: true },
    imap: { host: "imap.mail.yahoo.com", port: 993, secure: true },
    supportsImap: true,
    recommendedDailyLimit: 30,
    help: "Create an app password in Yahoo Account Security.",
  },
  zoho: {
    label: "Zoho Mail",
    smtp: { host: "smtp.zoho.com", port: 465, secure: true },
    imap: { host: "imap.zoho.com", port: 993, secure: true },
    supportsImap: true,
    recommendedDailyLimit: 30,
    help: "Use an app-specific password. IMAP must be enabled in Zoho Mail settings. EU accounts use smtp.zoho.eu / imap.zoho.eu.",
  },
  postal: {
    label: "Postal (custom SMTP)",
    smtp: null,
    imap: null,
    supportsImap: false,
    recommendedDailyLimit: 50,
    help: "Use your Postal server's SMTP host and an SMTP credential. Postal can't read replies, so replies go to the From inbox.",
  },
  custom: {
    label: "Other (custom SMTP / IMAP)",
    smtp: null,
    imap: null,
    supportsImap: true,
    recommendedDailyLimit: 30,
    help: "Enter the SMTP and IMAP settings from your email provider.",
  },
};
