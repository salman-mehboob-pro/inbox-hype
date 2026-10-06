// Email template engine (pure, no I/O).
//
// Variables:  {{firstName}}  {{first_name}}  {{company|your team}}  {{city}}
//   - Names are matched ignoring case and _ / - (firstName = first_name = FIRSTNAME).
//   - "|fallback" is used when the value is empty.
//   - Custom fields work the same way: {{company_size}}.
// Spin text:  {Hi|Hello|Hey}  picks one option. The pick is stable for the
//   same seed (lead + step), so retries and previews match what was sent.

export type TemplateLead = {
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  company?: string | null;
  title?: string | null;
  phone?: string | null;
  website?: string | null;
  linkedin_url?: string | null;
  timezone?: string | null;
  custom_fields?: Record<string, unknown> | null;
};

export type TemplateSender = { name?: string | null; email?: string | null };

export type RenderResult = {
  text: string;
  // Variables that had no value and no fallback (rendered as "").
  missing: string[];
};

const norm = (key: string) => key.toLowerCase().replace(/[^a-z0-9]/g, "");

// Built-in variables shown in the "Insert variable" menu (canonical names first).
export const STANDARD_VARIABLES = [
  { name: "firstName", label: "First name" },
  { name: "lastName", label: "Last name" },
  { name: "fullName", label: "Full name" },
  { name: "email", label: "Email" },
  { name: "company", label: "Company" },
  { name: "title", label: "Job title" },
  { name: "phone", label: "Phone" },
  { name: "website", label: "Website" },
  { name: "linkedin", label: "LinkedIn URL" },
  { name: "senderName", label: "Your name (sender)" },
  { name: "senderEmail", label: "Your email (sender)" },
] as const;

function buildValues(lead: TemplateLead, sender: TemplateSender): Map<string, string> {
  const v = new Map<string, string>();
  const set = (value: string | null | undefined, ...names: string[]) => {
    for (const n of names) v.set(norm(n), (value ?? "").trim());
  };

  // Custom fields first, so built-ins win on a name clash.
  for (const [k, val] of Object.entries(lead.custom_fields ?? {})) {
    if (val !== null && val !== undefined) set(String(val), k);
  }

  const fullName = [lead.first_name, lead.last_name].filter(Boolean).join(" ");
  set(lead.first_name, "firstName", "first");
  set(lead.last_name, "lastName", "last");
  set(fullName, "fullName", "name");
  set(lead.email, "email");
  set(lead.company, "company", "companyName");
  set(lead.title, "title", "jobTitle");
  set(lead.phone, "phone");
  set(lead.website, "website");
  set(lead.linkedin_url, "linkedin", "linkedinUrl");
  set(lead.timezone, "timezone");
  set(sender.name, "senderName");
  set(sender.email, "senderEmail");
  return v;
}

// Small deterministic hash (FNV-1a) -> used to pick spin options.
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const VAR_RE = /\{\{\s*([^{}|]+?)\s*(?:\|([^{}]*))?\}\}/g;
const SPIN_RE = /\{([^{}]*\|[^{}]*)\}/;

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Old plain-text bodies -> simple HTML (blank line = new paragraph).
export function textToHtml(text: string): string {
  if (!text.trim()) return "";
  return text
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

// Is this body already HTML (from the editor or pasted)?
export function looksLikeHtml(s: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(s);
}

export function render(
  template: string,
  lead: TemplateLead,
  sender: TemplateSender = {},
  seed = "",
  // html: escape lead values so they can't break the email's HTML.
  options: { html?: boolean } = {},
): RenderResult {
  const out = options.html ? escapeHtml : (s: string) => s;
  const values = buildValues(lead, sender);
  const missing = new Set<string>();

  // 1) Hide variables so spin text can't touch {{a|b}}.
  const vars: string[] = [];
  let text = template.replace(VAR_RE, (m) => {
    vars.push(m);
    return `\u0000${vars.length - 1}\u0000`;
  });

  // 2) Spin text, innermost first (supports nesting).
  let i = 0;
  let match: RegExpExecArray | null;
  while ((match = SPIN_RE.exec(text)) && i < 500) {
    const options = match[1].split("|");
    const pick = options[hash(`${seed}:${i}:${match[1]}`) % options.length];
    text = text.slice(0, match.index) + pick + text.slice(match.index + match[0].length);
    i++;
  }

  // 3) Put variables back and fill them in.
  text = text.replace(/\u0000(\d+)\u0000/g, (_, idx) =>
    vars[Number(idx)].replace(VAR_RE, (_m, name: string, fallback?: string) => {
      const value = values.get(norm(name));
      if (value) return out(value);
      if (fallback !== undefined) return out(fallback.trim());
      missing.add(name.trim());
      return "";
    }),
  );

  return { text, missing: [...missing] };
}

// Problems an author should fix before sending (shown in the editor).
export function lintTemplate(template: string): string[] {
  const problems: string[] = [];
  const opens = (template.match(/\{\{/g) ?? []).length;
  const closes = (template.match(/\}\}/g) ?? []).length;
  if (opens !== closes) return ["A variable is not closed. Use {{name}}."];
  const withoutVars = template.replace(VAR_RE, "");
  let depth = 0;
  for (const ch of withoutVars) {
    if (ch === "{") depth++;
    if (ch === "}") depth--;
    if (depth < 0) break;
  }
  if (depth !== 0) problems.push("Spin text is not closed. Use {Hi|Hello}.");
  return problems;
}

// Variable names used in a template (for "missing variable" checks).
export function usedVariables(template: string): string[] {
  return [...template.matchAll(VAR_RE)].filter((m) => m[2] === undefined).map((m) => m[1].trim());
}
