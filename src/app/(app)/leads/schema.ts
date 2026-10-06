import { z } from "zod";
import { isValidEmail, isValidTimeZone, LIMITS } from "@/lib/leads/import";

const value = z.string().trim().max(LIMITS.maxValueLength).optional();
const tag = z.string().trim().min(1).max(LIMITS.maxTagLength);

export const leadRowSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .refine(isValidEmail, "Invalid email"),
  first_name: value,
  last_name: value,
  company: value,
  title: value,
  phone: value,
  website: value,
  linkedin_url: value,
  timezone: z.string().trim().refine(isValidTimeZone, "Invalid timezone").optional(),
  tags: z.array(tag).max(LIMITS.maxTagsPerLead).default([]),
  custom_fields: z
    .record(
      z.string().regex(/^[a-z][a-z0-9_]*$/).max(LIMITS.customKeyLength),
      z.string().max(LIMITS.maxValueLength),
    )
    .refine((o) => Object.keys(o).length <= LIMITS.maxCustomFields, "Too many custom fields")
    .default({}),
});

export const IMPORT_CHUNK_SIZE = 500;

export const importChunkSchema = z.object({
  rows: z.array(leadRowSchema).min(1).max(IMPORT_CHUNK_SIZE),
  updateExisting: z.boolean(),
});

export const leadIdsSchema = z.array(z.uuid()).min(1).max(1000);
export const tagsSchema = z.array(tag).min(1).max(LIMITS.maxTagsPerLead);

// URL field: accepts "example.com" or a full link, stored as https://...
const url = z
  .string()
  .trim()
  .max(LIMITS.maxValueLength)
  .transform((v) => (v && !/^https?:\/\//i.test(v) ? `https://${v}` : v))
  .refine((v) => !v || URL.canParse(v), "Enter a valid link");

const linkedin = url.refine((v) => !v || /linkedin\.com\//i.test(v), "Enter a LinkedIn profile link");

const phone = z
  .string()
  .trim()
  .max(40, "Too long")
  .refine((v) => !v || /^[+()\d\s.\-]{5,}$/.test(v), "Enter a valid phone number");

const email = z.email("Enter a valid email").trim().toLowerCase();

export const newLeadSchema = leadRowSchema.extend({
  email,
  phone: phone.optional(),
  website: url.optional(),
  linkedin_url: linkedin.optional(),
  campaignId: z.uuid().optional(),
});

// Editing a lead: an empty field clears the value (stored as null).
const orNull = <T extends z.ZodType<string>>(s: T) => s.transform((v) => v || null);
const text = z.string().trim().max(LIMITS.maxValueLength);

export const contactSchema = z.object({
  email,
  first_name: orNull(text),
  last_name: orNull(text),
  company: orNull(text),
  title: orNull(text),
  phone: orNull(phone),
  linkedin_url: orNull(linkedin),
  website: orNull(url),
  timezone: orNull(z.string().trim().refine((v) => !v || isValidTimeZone(v), "Unknown timezone, e.g. Europe/Paris")),
});

export type ContactInput = z.input<typeof contactSchema>;

export const customFieldsSchema = leadRowSchema.shape.custom_fields;
export const notesSchema = z.string().max(10000, "Notes are too long (max 10,000 characters)");
