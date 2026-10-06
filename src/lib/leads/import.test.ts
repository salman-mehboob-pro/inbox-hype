import { describe, expect, it } from "vitest";
import {
  buildLeads,
  customFieldKey,
  guessMapping,
  isValidEmail,
  normalizeEmail,
  parseTags,
  validateMapping,
  type ColumnMapping,
} from "./import";

describe("guessMapping", () => {
  it("matches common header names", () => {
    const m = guessMapping(["Email Address", "First_Name", "last-name", "Company Name", "Job Title", "Company Size"]);
    expect(m.map((x) => x.target)).toEqual(["email", "first_name", "last_name", "company", "title", "custom"]);
    expect(m[5].customKey).toBe("company_size");
  });

  it("maps a field only once", () => {
    const m = guessMapping(["email", "Email"]);
    expect(m[0].target).toBe("email");
    expect(m[1].target).toBe("custom");
  });

  it("skips headers that give no usable key", () => {
    expect(guessMapping(["***"])[0].target).toBe("skip");
  });
});

describe("customFieldKey", () => {
  it("makes safe keys", () => {
    expect(customFieldKey("Company Size (est.)")).toBe("company_size_est");
    expect(customFieldKey("2024 revenue")).toBe("f_2024_revenue");
  });
});

describe("validateMapping", () => {
  const map = (...targets: ColumnMapping["target"][]): ColumnMapping[] =>
    targets.map((target, i) => ({ target, customKey: target === "custom" ? `field_${i}` : "" }));

  it("needs exactly one email column", () => {
    expect(validateMapping(map("first_name"))).toMatch(/email/);
    expect(validateMapping(map("email", "email"))).toMatch(/Only one/);
    expect(validateMapping(map("email", "first_name"))).toBeNull();
  });

  it("rejects the same field twice", () => {
    expect(validateMapping(map("email", "company", "company"))).toMatch(/Two columns/);
  });

  it("rejects bad or duplicate custom keys", () => {
    expect(validateMapping([{ target: "email", customKey: "" }, { target: "custom", customKey: "Bad Key" }])).toMatch(
      /lowercase/,
    );
    expect(
      validateMapping([
        { target: "email", customKey: "" },
        { target: "custom", customKey: "city" },
        { target: "custom", customKey: "city" },
      ]),
    ).toMatch(/city/);
  });
});

describe("emails", () => {
  it("normalizes", () => {
    expect(normalizeEmail("  MAILTO:Ann@Example.COM ")).toBe("ann@example.com");
    expect(normalizeEmail("<bob@x.io>")).toBe("bob@x.io");
  });

  it("validates", () => {
    expect(isValidEmail("ann@example.com")).toBe(true);
    expect(isValidEmail("ann@example")).toBe(false);
    expect(isValidEmail("ann example.com")).toBe(false);
    expect(isValidEmail("a,b@example.com")).toBe(false);
  });
});

describe("parseTags", () => {
  it("splits on , ; |", () => {
    expect(parseTags("vip, q4;  saas | ")).toEqual(["vip", "q4", "saas"]);
  });
});

describe("buildLeads", () => {
  const mapping = guessMapping(["email", "name", "company", "timezone", "tags", "city"]);

  it("builds leads, splits full name, collects custom fields and tags", () => {
    const { leads } = buildLeads(
      [["Ann@Example.com", "Ann Marie Khan", "Acme", "Asia/Karachi", "vip, q4", "Lahore"]],
      mapping,
      ["imported"],
    );
    expect(leads).toEqual([
      {
        email: "ann@example.com",
        first_name: "Ann",
        last_name: "Marie Khan",
        company: "Acme",
        timezone: "Asia/Karachi",
        tags: ["vip", "q4", "imported"],
        custom_fields: { city: "Lahore" },
      },
    ]);
  });

  it("reports invalid emails with the CSV line number, skips duplicates and blank lines", () => {
    const result = buildLeads(
      [
        ["a@example.com", "", "", "", "", ""],
        ["not-an-email", "", "", "", "", ""],
        ["", "", "", "", "", ""],
        ["", "No Email", "", "", "", ""],
        ["A@EXAMPLE.COM", "", "", "", "", ""],
      ],
      mapping,
    );
    expect(result.leads).toHaveLength(1);
    expect(result.duplicatesInFile).toBe(1);
    expect(result.invalid).toEqual([
      { rowNumber: 3, value: "not-an-email", reason: "Invalid email" },
      { rowNumber: 5, value: "", reason: "Missing email" },
    ]);
  });

  it("drops invalid timezones and counts them", () => {
    const result = buildLeads([["a@example.com", "", "", "Mars/Base", "", ""]], mapping);
    expect(result.leads[0].timezone).toBeUndefined();
    expect(result.invalidTimezones).toBe(1);
  });

  it("does not store empty values", () => {
    const { leads } = buildLeads([["a@example.com", "  ", "", "", "", "  "]], mapping);
    expect(leads[0]).toEqual({ email: "a@example.com", tags: [], custom_fields: {} });
  });
});
