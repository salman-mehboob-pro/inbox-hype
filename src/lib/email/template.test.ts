import { describe, expect, it } from "vitest";
import { lintTemplate, looksLikeHtml, render, textToHtml, usedVariables, type TemplateLead } from "./template";

const lead: TemplateLead = {
  email: "ann@example.com",
  first_name: "Ann",
  last_name: "Khan",
  company: "Acme",
  title: "CEO",
  custom_fields: { city: "Lahore", company_size: "50", pain_point: "" },
};

describe("render: variables", () => {
  it("fills standard variables in any naming style", () => {
    expect(render("Hi {{firstName}} {{last_name}} from {{COMPANY}}", lead).text).toBe("Hi Ann Khan from Acme");
    expect(render("{{fullName}} / {{jobTitle}} / {{email}}", lead).text).toBe("Ann Khan / CEO / ann@example.com");
  });

  it("fills custom fields", () => {
    expect(render("{{city}} {{companySize}} {{company_size}}", lead).text).toBe("Lahore 50 50");
  });

  it("uses the fallback when empty", () => {
    expect(render("Hi {{firstName|there}}", { email: "x@y.com" }).text).toBe("Hi there");
    expect(render("{{pain_point|growth}}", lead).text).toBe("growth");
    expect(render("Hi {{firstName|there}}", lead).text).toBe("Hi Ann");
  });

  it("reports missing variables without a fallback", () => {
    const r = render("Hi {{firstName}}, about {{unknownThing}}", { email: "x@y.com" });
    expect(r.text).toBe("Hi , about ");
    expect(r.missing).toEqual(["firstName", "unknownThing"]);
  });

  it("fills sender variables", () => {
    expect(render("— {{senderName}}", lead, { name: "Sarah" }).text).toBe("— Sarah");
  });

  it("allows spaces inside braces", () => {
    expect(render("{{ firstName | there }}", lead).text).toBe("Ann");
  });
});

describe("render: spin text", () => {
  it("picks one option", () => {
    const out = render("{Hi|Hello|Hey} {{firstName}}", lead, {}, "seed-1").text;
    expect(["Hi Ann", "Hello Ann", "Hey Ann"]).toContain(out);
  });

  it("is stable for the same seed", () => {
    const a = render("{Hi|Hello|Hey} {A|B|C|D}", lead, {}, "lead-1:step-1").text;
    const b = render("{Hi|Hello|Hey} {A|B|C|D}", lead, {}, "lead-1:step-1").text;
    expect(a).toBe(b);
  });

  it("varies across seeds", () => {
    const outs = new Set(Array.from({ length: 30 }, (_, i) => render("{a|b|c}", lead, {}, `s${i}`).text));
    expect(outs.size).toBeGreaterThan(1);
  });

  it("does not treat {{var|fallback}} as spin text", () => {
    expect(render("{{firstName|there}}", { email: "x@y.com" }, {}, "x").text).toBe("there");
  });

  it("supports nesting and variables inside spin text", () => {
    const out = render("{Hi {{firstName}}|Hello {there|friend}}", lead, {}, "n").text;
    expect(["Hi Ann", "Hello there", "Hello friend"]).toContain(out);
  });

  it("leaves plain braces without | alone", () => {
    expect(render("price {not spin}", lead).text).toBe("price {not spin}");
  });
});

describe("render: html mode", () => {
  it("escapes lead values but keeps the template's HTML", () => {
    const evil: TemplateLead = { email: "x@y.com", first_name: '<script>alert("x")</script>', company: "A & B" };
    const r = render("<p>Hi <b>{{firstName}}</b> at {{company}}</p>", evil, {}, "", { html: true });
    expect(r.text).toBe("<p>Hi <b>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;</b> at A &amp; B</p>");
  });

  it("does not escape in plain mode (subjects)", () => {
    expect(render("{{company}}", { email: "x@y.com", company: "A & B" }).text).toBe("A & B");
  });
});

describe("textToHtml / looksLikeHtml", () => {
  it("turns paragraphs and line breaks into HTML", () => {
    expect(textToHtml("Hi {{firstName}},\n\nLine 1\nLine 2")).toBe("<p>Hi {{firstName}},</p><p>Line 1<br>Line 2</p>");
    expect(textToHtml("a < b")).toBe("<p>a &lt; b</p>");
  });

  it("detects HTML", () => {
    expect(looksLikeHtml("<p>hi</p>")).toBe(true);
    expect(looksLikeHtml("Hi {{firstName}}, 2 < 3")).toBe(false);
  });
});

describe("lintTemplate", () => {
  it("finds unclosed variables and spin text", () => {
    expect(lintTemplate("Hi {{firstName}")).toHaveLength(1);
    expect(lintTemplate("{Hi|Hello")).toHaveLength(1);
    expect(lintTemplate("{Hi|Hello} {{firstName|there}}")).toEqual([]);
  });
});

describe("usedVariables", () => {
  it("lists variables without a fallback", () => {
    expect(usedVariables("{{firstName}} {{company|you}} {{city}}")).toEqual(["firstName", "city"]);
  });
});
