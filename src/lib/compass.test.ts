import { describe, expect, it } from "vitest";
import {
  RESEARCH_QUERY_MAX, buildResearchQuery, computeTotals, flagRequirement, groundSourceUrl, isOfficialUrl, isTerminal, parseResearchProgress,
  type PlaceResearch, type Requirement,
} from "./compass";

const base: Requirement = {
  category: "activity_licence", title: "Food permit", authority: "City", description: null,
  cost_amount: 100, currency: "USD", cost_note: null, time_days: 10, time_note: null,
  renewal: null, source_url: "https://www.austintexas.gov/permit", checked_at: "2026-11-07",
  is_official: false, source_live: true, flags: [],
};

describe("official source rule", () => {
  it("accepts government domains", () => {
    expect(isOfficialUrl("https://www.gov.uk/x")).toBe(true);
    expect(isOfficialUrl("https://www.faa.gov/uas")).toBe(true);
    expect(isOfficialUrl("https://digitalsky.dgca.gov.in")).toBe(true);
    expect(isOfficialUrl("https://www.toronto.ca/business")).toBe(true);
    expect(isOfficialUrl("https://sos.state.tx.us/")).toBe(true);
  });
  it("accepts government domains for places outside the built-in list", () => {
    expect(isOfficialUrl("https://dichvucong.gov.vn/p")).toBe(true);
    expect(isOfficialUrl("https://www.brela.go.tz/")).toBe(true);
    expect(isOfficialUrl("https://www.gob.pe/x")).toBe(true);
    expect(isOfficialUrl("https://www.metro.tokyo.lg.jp/")).toBe(true);
    expect(isOfficialUrl("https://www.nsw.gov.au/business")).toBe(true);
  });
  it("rejects non-government domains", () => {
    expect(isOfficialUrl("https://www.legalzoom.com/x")).toBe(false);
    expect(isOfficialUrl("https://fakegov.com")).toBe(false);
    expect(isOfficialUrl("https://gov.example.com")).toBe(false);
    expect(isOfficialUrl(null)).toBe(false);
  });
});

describe("research query", () => {
  it("stays within TinyResearch's 2,000 character limit with long inputs", () => {
    const q = buildResearchQuery("a".repeat(300), "p".repeat(200), "n".repeat(1000));
    expect(q.length).toBeLessThanOrEqual(RESEARCH_QUERY_MAX);
    expect(q).toContain("Do not look up whether any specific person or business holds a licence.");
  });
  it("keeps short notes intact", () => {
    expect(buildResearchQuery("Open a café", "Austin", "3 staff")).toContain("Context: 3 staff.");
  });
});

describe("research progress", () => {
  it("reads plan, sources and iterations from a run, whatever the nesting", () => {
    const p = parseResearchProgress({
      iterations: 2,
      research_plan: { subquestions: [{ question: "Food permit fee in Austin?" }, "Zoning rules?"] },
      evidence: [{ url: "https://www.austintexas.gov/a" }, { source: { url: "https://www.tabc.texas.gov/b" } }, "https://www.austintexas.gov/a"],
    });
    expect(p).toEqual({ iterations: 2, plan: ["Food permit fee in Austin?", "Zoning rules?"], sources: 2, hosts: ["austintexas.gov", "tabc.texas.gov"] });
  });
  it("tolerates missing fields", () => {
    expect(parseResearchProgress({})).toEqual({ iterations: null, plan: [], sources: 0, hosts: [] });
  });
  it("treats cancelled as terminal", () => {
    expect(isTerminal("cancelled")).toBe(true);
    expect(isTerminal("researching")).toBe(false);
  });
});

describe("source grounding", () => {
  const report = "Fee is $50 ([source](https://www.austintexas.gov/permit/)). See also https://www.tabc.texas.gov/licenses.";
  it("keeps links that appear in the report or citations", () => {
    expect(groundSourceUrl("https://austintexas.gov/permit", report, [])).toBe("https://austintexas.gov/permit");
    expect(groundSourceUrl("https://www.tabc.texas.gov/licenses", report, [])).toBe("https://www.tabc.texas.gov/licenses");
    expect(groundSourceUrl("https://www.sos.state.tx.us/corp", "", ["https://www.sos.state.tx.us/corp/"])).not.toBeNull();
  });
  it("drops links the model invented", () => {
    expect(groundSourceUrl("https://www.austintexas.gov/made-up", report, [])).toBeNull();
    expect(groundSourceUrl("not a url", report, [])).toBeNull();
    expect(groundSourceUrl(null, report, [])).toBeNull();
  });
});

describe("gap flagging", () => {
  it("does not flag a complete official item", () => {
    expect(flagRequirement(base).flags).toEqual([]);
  });
  it("flags missing cost and time instead of guessing", () => {
    const r = flagRequirement({ ...base, cost_amount: null, time_days: null });
    expect(r.flags).toHaveLength(2);
    expect(r.cost_amount).toBeNull();
  });
  it("flags unofficial and missing sources", () => {
    expect(flagRequirement({ ...base, source_url: "https://blog.com/a" }).is_official).toBe(false);
    expect(flagRequirement({ ...base, source_url: null }).flags[0]).toMatch(/No source/);
  });
});

describe("totals", () => {
  it("counts unknown costs separately from known sums", () => {
    const p = { requirements: [flagRequirement(base), flagRequirement({ ...base, cost_amount: null })], usdRate: 1 } as PlaceResearch;
    const t = computeTotals(p);
    expect(t.upfrontKnown).toBe(100);
    expect(t.upfrontUnknownCount).toBe(1);
  });
});
