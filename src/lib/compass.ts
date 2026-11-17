// Pure, browser/server-safe types and rules for TinyCompass.

export const CATEGORIES = [
  { id: "business_registration", label: "Business registration" },
  { id: "tax_registration", label: "Tax registration" },
  { id: "activity_licence", label: "Activity licence" },
  { id: "zoning_premises", label: "Zoning & premises" },
  { id: "health_safety", label: "Health & safety inspection" },
  { id: "permits_certifications", label: "Permits & certifications" },
  { id: "insurance", label: "Insurance" },
  { id: "employer_registration", label: "Employer registration" },
  { id: "renewals", label: "Renewals" },
  { id: "ongoing_filings", label: "Ongoing filings" },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]["id"];

export interface Requirement {
  category: CategoryId;
  title: string;
  authority: string | null;
  description: string | null;
  cost_amount: number | null;
  currency: string | null;
  cost_note: string | null;
  time_days: number | null;
  time_note: string | null;
  renewal: string | null;
  source_url: string | null;
  checked_at: string | null;
  is_official: boolean;
  source_live: boolean | null;
  flags: string[];
}

export type PlaceStatus =
  | "queued"
  | "researching"
  | "structuring"
  | "verifying"
  | "done"
  | "failed"
  | "cancelled";

export const TERMINAL_STATUSES: PlaceStatus[] = ["done", "failed", "cancelled"];
export const isTerminal = (s: PlaceStatus) => TERMINAL_STATUSES.includes(s);

export interface ResearchProgress {
  iterations: number | null;
  plan: string[];
  sources: number;
  hosts: string[];
}

export interface PlaceResearch {
  place: string;
  status: PlaceStatus;
  runId: string | null;
  runStatus: string | null;
  // Set just before the async start call, so a refresh mid-request can find the run instead of starting a second, billed one.
  startRequestedAt?: string | null;
  progress?: ResearchProgress | null;
  error: string | null;
  report: string | null;
  citations: string[];
  requirements: Requirement[];
  unclear: string[];
  usdRate: number | null;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface Recommendation {
  best_place: string | null;
  summary: string;
  tradeoffs: { place: string; pros: string[]; cons: string[] }[];
  caveats: string[];
}

export interface Comparison {
  id: string;
  activity: string;
  notes: string;
  createdAt: string;
  places: PlaceResearch[];
  recommendation: Recommendation | null;
  recommendationError: string | null;
}

// ---------- Official-source rule ----------

const OFFICIAL_SUFFIXES = [
  ".gov", ".mil", ".gov.uk", ".gov.au", ".gov.in", ".nic.in", ".gc.ca", ".gov.sg",
  ".govt.nz", ".gov.ie", ".gov.za", ".gov.br", ".gob.mx", ".gob.es", ".gouv.fr",
  ".gov.it", ".bund.de", ".europa.eu", ".gov.ae", ".go.jp", ".go.kr", ".gov.hk",
  ".gov.ph", ".go.id", ".gov.my", ".go.th", ".gov.ng", ".go.ke", ".gov.pk", ".gov.bd",
  ".gov.lk", ".gov.sa", ".gov.qa", ".gov.il", ".gov.pl", ".gov.pt", ".gv.at", ".admin.ch",
  ".overheid.nl", ".gov.cn", ".gob.ar", ".gob.cl", ".gov.co", ".gub.uy", ".gov.tr",
];

// Well-known official portals whose domain doesn't end in a government suffix.
const OFFICIAL_HOSTS = [
  "ontario.ca", "toronto.ca", "canada.ca", "quebec.ca", "alberta.ca", "vancouver.ca",
  "london.gov.uk", "service-public.fr", "bundesregierung.de", "belastingdienst.nl",
  "kvk.nl", "caa.co.uk", "dgca.gov.in", "digitalsky.dgca.gov.in", "nyc.gov",
  "austintexas.gov", "sos.state.tx.us", "comptroller.texas.gov", "sba.gov",
  "faa.gov", "irs.gov", "companieshouse.gov.uk", "hmrc.gov.uk", "food.gov.uk",
  "mca.gov.in", "fssai.gov.in", "bizfile.gov.sg", "acra.gov.sg", "dubai.ae", "ded.ae",
];

export function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

// Government second-level domains under any country code, e.g. gov.vn, go.tz, gob.pe, gouv.qc.ca, lg.jp.
const OFFICIAL_PATTERNS = [
  /(^|\.)(gov|gob|gouv|govt|gv|go|gub)\.[a-z]{2}$/,
  /(^|\.)(gov|gob|gouv|gc)\.[a-z]{2}\.[a-z]{2}$/,
  /(^|\.)(gov|gouv)\.[a-z]{2}\.ca$/,
  /(^|\.)lg\.jp$/,
];

export function isOfficialUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const host = hostOf(url);
  if (!host) return false;
  if (OFFICIAL_HOSTS.some((h) => host === h || host.endsWith("." + h))) return true;
  if (OFFICIAL_SUFFIXES.some((s) => host.endsWith(s) || host === s.slice(1))) return true;
  if (OFFICIAL_PATTERNS.some((p) => p.test(host))) return true;
  // US state/municipal patterns: *.state.xx.us, *.ci.city.xx.us, *.co.county.xx.us
  if (/\.(state|ci|co|city|county)\.[a-z]{2}\.us$/.test(host)) return true;
  if (/^(state|ci|co|city|county)\.[a-z]{2}\.us$/.test(host)) return true;
  return false;
}

export const RESEARCH_DOMAINS = Array.from(
  new Set([...OFFICIAL_HOSTS, ...OFFICIAL_SUFFIXES.map((s) => s.slice(1))]),
).slice(0, 150);

// ---------- Gap flagging (never guess) ----------

export function flagRequirement(r: Requirement): Requirement {
  const flags: string[] = [];
  const is_official = isOfficialUrl(r.source_url);
  if (!r.source_url) flags.push("No source link. Confirm with the authority.");
  else if (!is_official) flags.push("Could not confirm the source is an official government site");
  if (r.source_live === false) flags.push("Source page could not be reached when checked");
  if (r.cost_amount === null) flags.push("Cost not stated on official source");
  if (r.time_days === null) flags.push("Time to approval not stated");
  return { ...r, is_official, flags };
}

export interface PlaceTotals {
  upfrontKnown: number; // in USD where rate known, else local
  upfrontCurrency: string;
  upfrontUnknownCount: number;
  maxDays: number | null;
  daysUnknownCount: number;
  steps: number;
  ongoingCount: number;
  flaggedCount: number;
  officialShare: number; // 0..1
}

const ONGOING: CategoryId[] = ["renewals", "ongoing_filings"];

export function computeTotals(p: PlaceResearch): PlaceTotals {
  const reqs = p.requirements;
  const setup = reqs.filter((r) => !ONGOING.includes(r.category));
  let upfront = 0;
  let unknown = 0;
  const currencies = new Set<string>();
  for (const r of setup) {
    if (r.cost_amount === null) {
      unknown++;
      continue;
    }
    if (p.usdRate && r.currency) {
      upfront += r.cost_amount / p.usdRate;
      currencies.add("USD");
    } else {
      upfront += r.cost_amount;
      currencies.add(r.currency ?? "?");
    }
  }
  const days = setup.map((r) => r.time_days).filter((d): d is number => d !== null);
  return {
    upfrontKnown: Math.round(upfront),
    upfrontCurrency: currencies.size === 1 ? ([...currencies][0] ?? "USD") : currencies.size ? "mixed" : "USD",
    upfrontUnknownCount: unknown,
    maxDays: days.length ? Math.max(...days) : null,
    daysUnknownCount: setup.length - days.length,
    steps: setup.length,
    ongoingCount: reqs.filter((r) => ONGOING.includes(r.category)).length,
    flaggedCount: reqs.filter((r) => r.flags.length > 0).length,
    officialShare: reqs.length ? reqs.filter((r) => r.is_official).length / reqs.length : 0,
  };
}

// TinyResearch rejects queries over 2,000 characters with 400 INVALID_INPUT.
export const RESEARCH_QUERY_MAX = 2000;

export function buildResearchQuery(activity: string, place: string, notes: string): string {
  const head = `What does someone legally need to do to start "${activity}" in ${place}?`;
  const body = `
Use ONLY official government sources (national, state/provincial and city/municipal government websites and regulators).
For EACH of these categories list every required licence, registration, permit or filing: business registration, tax registration, activity-specific licence, zoning/premises approval, health & safety inspection, other permits/certifications, mandatory insurance, employer registration, renewals, ongoing/annual filings.
For each item give: exact name, issuing authority, official fee (amount + currency), typical processing time, renewal frequency, and the exact official URL where it is stated.
If a fee, time or rule is not published or is unclear, say explicitly "not stated". Do not estimate.
Do not look up whether any specific person or business holds a licence.`;
  const room = RESEARCH_QUERY_MAX - head.length - body.length - " Context: .".length;
  const ctx = notes.trim() && room > 0 ? ` Context: ${notes.trim().slice(0, room)}.` : "";
  return (head + ctx + body).slice(0, RESEARCH_QUERY_MAX);
}

// ---------- Live progress from GET /v1/research-run/{id} (research_plan, evidence, iterations) ----------

const pickText = (v: unknown): string | null => {
  if (typeof v === "string") return v.trim() || null;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    for (const k of ["question", "subquestion", "query", "text", "title"]) if (typeof o[k] === "string" && o[k]) return o[k] as string;
  }
  return null;
};

const pickUrl = (v: unknown): string | null => {
  if (typeof v === "string") return /^https?:\/\//.test(v) ? v : null;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    for (const k of ["url", "source_url", "link"]) if (typeof o[k] === "string") return o[k] as string;
    if (o["source"]) return pickUrl(o["source"]);
  }
  return null;
};

const listOf = (v: unknown, keys: string[]): unknown[] => {
  if (Array.isArray(v)) return v;
  if (v && typeof v === "object") for (const k of keys) {
    const x = (v as Record<string, unknown>)[k];
    if (Array.isArray(x)) return x;
  }
  return [];
};

export function parseResearchProgress(run: Record<string, unknown>): ResearchProgress {
  const plan = listOf(run["research_plan"], ["subquestions", "questions", "steps", "searches"]).map(pickText).filter((s): s is string => !!s);
  const urls = listOf(run["evidence"], ["sources", "items", "evidence"]).map(pickUrl).filter((u): u is string => !!u);
  const hosts = [...new Set(urls.map(hostOf).filter((h): h is string => !!h))];
  const it = run["iterations"];
  return { iterations: typeof it === "number" ? it : null, plan: plan.slice(0, 4), sources: new Set(urls).size, hosts: hosts.slice(-6) };
}

// ---------- Source grounding (links must come from TinyResearch, not the LLM) ----------

function normalizeUrl(url: string): string | null {
  try {
    const u = new URL(url.trim());
    if (!/^https?:$/.test(u.protocol)) return null;
    u.hash = "";
    return `${u.hostname.toLowerCase().replace(/^www\./, "")}${u.pathname.replace(/\/+$/, "")}${u.search}`;
  } catch {
    return null;
  }
}

export function extractUrls(text: string): string[] {
  return (text.match(/https?:\/\/[^\s<>"'()[\]]+/g) ?? []).map((u) => u.replace(/[.,;:!?*_`]+$/, ""));
}

export function groundSourceUrl(url: string | null, report: string, citations: string[]): string | null {
  const key = url ? normalizeUrl(url) : null;
  if (!key) return null;
  const known = new Set([...citations, ...extractUrls(report)].map(normalizeUrl).filter(Boolean));
  return known.has(key) ? url!.trim() : null;
}

export const DEMOS = [
  { activity: "Open a café", places: ["Austin, Texas, USA", "Toronto, Ontario, Canada", "London, UK"], notes: "Small sit-down café, serves food, 3 staff" },
  { activity: "Run a commercial drone business", places: ["United States", "United Kingdom", "India"], notes: "Aerial photography with drones under 25 kg" },
];
