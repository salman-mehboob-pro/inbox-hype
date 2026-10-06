// Pure CSV-import logic (no I/O), shared by the browser import wizard and tests.

export const LEAD_FIELDS = [
  { key: "email", label: "Email", aliases: ["email", "e mail", "email address", "work email", "mail", "emailaddress"] },
  { key: "first_name", label: "First name", aliases: ["first name", "firstname", "first", "given name", "fname"] },
  { key: "last_name", label: "Last name", aliases: ["last name", "lastname", "last", "surname", "family name", "lname"] },
  { key: "full_name", label: "Full name (split)", aliases: ["name", "full name", "fullname", "contact name", "contact"] },
  { key: "company", label: "Company", aliases: ["company", "company name", "organization", "organisation", "business", "account name"] },
  { key: "title", label: "Job title", aliases: ["title", "job title", "jobtitle", "position", "role"] },
  { key: "phone", label: "Phone", aliases: ["phone", "phone number", "mobile", "mobile phone", "telephone", "tel"] },
  { key: "website", label: "Website", aliases: ["website", "url", "web", "domain", "company website", "company domain", "site"] },
  { key: "linkedin_url", label: "LinkedIn URL", aliases: ["linkedin", "linkedin url", "linkedin profile", "person linkedin url"] },
  { key: "timezone", label: "Timezone", aliases: ["timezone", "time zone", "tz"] },
  { key: "tags", label: "Tags (comma separated)", aliases: ["tags", "tag", "labels", "label"] },
] as const;

export type LeadFieldKey = (typeof LEAD_FIELDS)[number]["key"];
export type ColumnTarget = LeadFieldKey | "custom" | "skip";
export type ColumnMapping = { target: ColumnTarget; customKey: string };

export type LeadImportRow = {
  email: string;
  first_name?: string;
  last_name?: string;
  company?: string;
  title?: string;
  phone?: string;
  website?: string;
  linkedin_url?: string;
  timezone?: string;
  tags: string[];
  custom_fields: Record<string, string>;
};

export const LIMITS = {
  maxRows: 20_000,
  maxValueLength: 500,
  maxTagLength: 50,
  maxTagsPerLead: 20,
  maxCustomFields: 50,
  customKeyLength: 40,
} as const;

const EMAIL_RE = /^[^\s@<>()[\],;:"]+@[^\s@<>()[\],;:"]+\.[a-z]{2,}$/i;

function normalizeHeader(h: string) {
  return h
    .toLowerCase()
    .replace(/[_\-.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// "Company Size (est.)" -> "company_size_est". Used as {{company_size_est}} in emails.
export function customFieldKey(header: string): string {
  let key = header
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, LIMITS.customKeyLength);
  if (/^[0-9]/.test(key)) key = `f_${key}`;
  return key;
}

export function guessMapping(headers: string[]): ColumnMapping[] {
  const used = new Set<LeadFieldKey>();
  return headers.map((header) => {
    const norm = normalizeHeader(header);
    const field = LEAD_FIELDS.find(
      (f) => !used.has(f.key) && (f.aliases as readonly string[]).includes(norm),
    );
    if (field) {
      used.add(field.key);
      return { target: field.key, customKey: "" };
    }
    const key = customFieldKey(header);
    return key ? { target: "custom", customKey: key } : { target: "skip", customKey: "" };
  });
}

// Returns an error message if the mapping can't be imported, else null.
export function validateMapping(mapping: ColumnMapping[]): string | null {
  const emailColumns = mapping.filter((m) => m.target === "email").length;
  if (emailColumns === 0) return "Choose which column has the email address.";
  if (emailColumns > 1) return "Only one column can be the email address.";

  const standard = mapping.filter((m) => m.target !== "custom" && m.target !== "skip").map((m) => m.target);
  const dup = standard.find((t, i) => standard.indexOf(t) !== i);
  if (dup) return `Two columns are mapped to "${LEAD_FIELDS.find((f) => f.key === dup)?.label}".`;

  const customKeys = mapping.filter((m) => m.target === "custom").map((m) => m.customKey);
  if (customKeys.some((k) => !/^[a-z][a-z0-9_]*$/.test(k))) {
    return "Custom field names may only use lowercase letters, numbers and _ (and start with a letter).";
  }
  const dupKey = customKeys.find((k, i) => customKeys.indexOf(k) !== i);
  if (dupKey) return `Two columns use the custom field name "${dupKey}".`;
  if (customKeys.length > LIMITS.maxCustomFields) return `At most ${LIMITS.maxCustomFields} custom fields.`;
  return null;
}

export function normalizeEmail(raw: string): string {
  return raw
    .trim()
    .replace(/^mailto:/i, "")
    .replace(/^<|>$/g, "")
    .trim()
    .toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return email.length <= 254 && EMAIL_RE.test(email);
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function parseTags(raw: string): string[] {
  return raw
    .split(/[,;|]/)
    .map((t) => t.trim().slice(0, LIMITS.maxTagLength))
    .filter(Boolean);
}

export function mergeTags(...lists: string[][]): string[] {
  return [...new Set(lists.flat())].slice(0, LIMITS.maxTagsPerLead);
}

const clean = (v: string | undefined) => {
  const t = (v ?? "").trim();
  return t ? t.slice(0, LIMITS.maxValueLength) : undefined;
};

export type InvalidRow = { rowNumber: number; value: string; reason: string };

export type BuildResult = {
  leads: LeadImportRow[];
  invalid: InvalidRow[];
  duplicatesInFile: number;
  invalidTimezones: number;
};

// rows = data rows (header row removed). rowNumber in errors is the CSV line (header = 1).
export function buildLeads(
  rows: string[][],
  mapping: ColumnMapping[],
  extraTags: string[] = [],
): BuildResult {
  const leads: LeadImportRow[] = [];
  const invalid: InvalidRow[] = [];
  const seen = new Set<string>();
  let duplicatesInFile = 0;
  let invalidTimezones = 0;

  const emailIndex = mapping.findIndex((m) => m.target === "email");

  rows.forEach((row, i) => {
    const rowNumber = i + 2;
    if (row.every((cell) => !cell?.trim())) return; // blank line

    const rawEmail = row[emailIndex] ?? "";
    const email = normalizeEmail(rawEmail);
    if (!email) {
      invalid.push({ rowNumber, value: "", reason: "Missing email" });
      return;
    }
    if (!isValidEmail(email)) {
      invalid.push({ rowNumber, value: rawEmail.trim(), reason: "Invalid email" });
      return;
    }
    if (seen.has(email)) {
      duplicatesInFile++;
      return;
    }
    seen.add(email);

    const lead: LeadImportRow = { email, tags: [], custom_fields: {} };
    let tags: string[] = [];

    mapping.forEach((m, col) => {
      const value = clean(row[col]);
      if (!value || m.target === "skip" || m.target === "email") return;
      switch (m.target) {
        case "full_name": {
          const [first, ...rest] = value.split(/\s+/);
          lead.first_name ??= first;
          if (rest.length) lead.last_name ??= rest.join(" ");
          break;
        }
        case "tags":
          tags = tags.concat(parseTags(value));
          break;
        case "timezone":
          if (isValidTimeZone(value)) lead.timezone = value;
          else invalidTimezones++;
          break;
        case "custom":
          lead.custom_fields[m.customKey] = value;
          break;
        default:
          lead[m.target] = value;
      }
    });

    lead.tags = mergeTags(tags, extraTags);
    leads.push(lead);
  });

  return { leads, invalid, duplicatesInFile, invalidTimezones };
}
