import { z } from "zod";

export const templateSchema = z.object({
  name: z.string().trim().min(1, "Enter a name").max(200, "Max 200 characters"),
  subject: z.string().max(500, "Subject is too long (max 500)"),
  body: z.string().max(200_000, "Email is too long (max 200,000 characters of HTML)"),
  body_format: z.enum(["rich", "html"]).default("rich"),
});

export type TemplateInput = z.input<typeof templateSchema>;

// What the sequence editor needs to fill a step from a template.
export type TemplateOption = {
  id: string;
  name: string;
  subject: string;
  body: string;
  body_format: string;
};
