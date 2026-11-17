import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { CATEGORIES, RESEARCH_DOMAINS, buildResearchQuery, groundSourceUrl, parseResearchProgress } from "./compass";

const TF = "https://agent.tinyfish.ai";

async function tfError(res: Response) {
  const t = await res.text();
  try {
    const j = JSON.parse(t);
    const code = j?.error?.code ? ` ${j.error.code}` : "";
    return `TinyFish ${res.status}${code}: ${j?.error?.message ?? t.slice(0, 200)}`;
  } catch {
    return `TinyFish ${res.status}: ${t.slice(0, 200)}`;
  }
}

const researchInput = z.object({ key: z.string().min(1), activity: z.string().min(1).max(300), place: z.string().min(1).max(200), notes: z.string().max(1000) });

export const startResearch = createServerFn({ method: "POST" })
  .inputValidator((d) => researchInput.parse(d))
  .handler(async ({ data }) => {
    const res = await fetch(`${TF}/v1/automation/run-research-async`, {
      method: "POST",
      headers: { "X-API-Key": data.key, "Content-Type": "application/json" },
      body: JSON.stringify({
        query: buildResearchQuery(data.activity, data.place, data.notes),
        mode: "deep",
        output_language: "en",
        domain_filter: { mode: "include", domains: RESEARCH_DOMAINS, block: [] },
      }),
    });
    if (!res.ok) throw new Error(await tfError(res));
    const j = (await res.json()) as { research_run_id?: string; error?: unknown };
    if (!j.research_run_id) throw new Error("TinyFish did not return a research run id");
    return { runId: j.research_run_id };
  });

export const getResearch = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ key: z.string().min(1), runId: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    const res = await fetch(`${TF}/v1/research-run/${encodeURIComponent(data.runId)}`, {
      headers: { "X-API-Key": data.key },
    });
    if (!res.ok) throw new Error(await tfError(res));
    const j = (await res.json()) as {
      status: string;
      deep_result?: { result?: string; citations?: unknown[] } | null;
      error?: { code?: string; message?: string } | null;
    };
    const citations = (j.deep_result?.citations ?? [])
      .map((c) => (typeof c === "string" ? c : (c as { url?: string })?.url))
      .filter((c): c is string => typeof c === "string");
    const error = j.error ? [j.error.code, j.error.message].filter(Boolean).join(": ") || null : null;
    const progress = parseResearchProgress(j as unknown as Record<string, unknown>);
    return { status: j.status, report: j.deep_result?.result ?? null, citations, error, progress };
  });

export const cancelResearch = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ key: z.string().min(1), runId: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    const res = await fetch(`${TF}/v1/research-run/${encodeURIComponent(data.runId)}/cancel`, {
      method: "POST",
      headers: { "X-API-Key": data.key },
    });
    if (res.status === 404) return { status: "NOT_FOUND", cancelled: false };
    if (!res.ok) throw new Error(await tfError(res));
    const j = (await res.json()) as { status?: string; cancelled?: boolean };
    return { status: j.status ?? "CANCELLED", cancelled: !!j.cancelled };
  });

// Async starts aren't idempotent: after a refresh mid-start, look for the run before starting another one.
export const findResearchRun = createServerFn({ method: "POST" })
  .inputValidator((d) => researchInput.extend({ since: z.string().datetime() }).parse(d))
  .handler(async ({ data }) => {
    const query = buildResearchQuery(data.activity, data.place, data.notes);
    const since = new Date(new Date(data.since).getTime() - 120_000).toISOString();
    const res = await fetch(`${TF}/v1/research-run?created_after=${encodeURIComponent(since)}&limit=50`, {
      headers: { "X-API-Key": data.key },
    });
    if (!res.ok) throw new Error(await tfError(res));
    const j = (await res.json()) as { data?: { research_run_id: string; query?: string; status?: string }[] };
    const hit = (j.data ?? []).find((r) => r.query === query);
    return hit ? { runId: hit.research_run_id, status: hit.status ?? "QUEUED" } : null;
  });

export const verifySources = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ key: z.string().min(1), urls: z.array(z.string().url()).max(60) }).parse(d))
  .handler(async ({ data }) => {
    const out: Record<string, { live: boolean; title: string | null; checked_at: string }> = {};
    const now = new Date().toISOString();
    for (let i = 0; i < data.urls.length; i += 10) {
      const batch = data.urls.slice(i, i + 10);
      try {
        const res = await fetch("https://api.fetch.tinyfish.ai", {
          method: "POST",
          headers: { "X-API-Key": data.key, "Content-Type": "application/json" },
          body: JSON.stringify({ urls: batch, format: "markdown", ttl: 0, per_url_timeout_ms: 30000, purpose: "Verify official government licensing page is live" }),
        });
        const j = res.ok ? ((await res.json()) as { results?: { url: string; title?: string | null }[] }) : { results: [] };
        const ok = new Map((j.results ?? []).map((r) => [r.url, r.title ?? null]));
        for (const u of batch) out[u] = { live: ok.has(u), title: ok.get(u) ?? null, checked_at: now };
      } catch {
        for (const u of batch) out[u] = { live: false, title: null, checked_at: now };
      }
    }
    return out;
  });

const llmInput = z.object({ llmKey: z.string().min(1), baseUrl: z.string().url(), model: z.string().min(1) });

async function llmJson(cfg: z.infer<typeof llmInput>, system: string, user: string) {
  const res = await fetch(`${cfg.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.llmKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: cfg.model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
    }),
  });
  if (!res.ok) throw new Error(`AI model ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const txt = j.choices?.[0]?.message?.content ?? "";
  const m = txt.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("AI model returned no JSON");
  return JSON.parse(m[0]);
}

const reqSchema = z.object({
  category: z.enum(CATEGORIES.map((c) => c.id) as [string, ...string[]]),
  title: z.string(),
  authority: z.string().nullable().catch(null),
  description: z.string().nullable().catch(null),
  cost_amount: z.number().nullable().catch(null),
  currency: z.string().nullable().catch(null),
  cost_note: z.string().nullable().catch(null),
  time_days: z.number().nullable().catch(null),
  time_note: z.string().nullable().catch(null),
  renewal: z.string().nullable().catch(null),
  source_url: z.string().nullable().catch(null),
});

export const structureReport = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    llmInput.extend({ activity: z.string(), place: z.string(), report: z.string().max(200000), citations: z.array(z.string()) }).parse(d),
  )
  .handler(async ({ data }) => {
    const system = `You convert a research report about business licensing into strict JSON. NEVER invent values.
If a fee, time, renewal or URL is not explicitly in the report, use null. Only use source URLs that appear in the report or citation list.
Return: {"currency_code":"ISO 4217 local currency","requirements":[{"category":one of ${CATEGORIES.map((c) => c.id).join("|")},"title","authority","description"(1 sentence),"cost_amount"(number or null; government fee only),"currency"(ISO),"cost_note"(e.g. "varies by seating" or null),"time_days"(number of days or null),"time_note","renewal"(e.g. "Annual" or null),"source_url"}],"unclear":["rules that are unclear, conflicting or not published"]}`;
    const user = `Activity: ${data.activity}\nPlace: ${data.place}\nCitations:\n${data.citations.join("\n")}\n\nREPORT:\n${data.report}`;
    const j = await llmJson(data, system, user);
    const reqs = z.array(z.unknown()).catch([]).parse(j.requirements)
      .map((r) => reqSchema.safeParse(r))
      .filter((r) => r.success)
      .map((r) => ({ ...r.data!, source_url: groundSourceUrl(r.data!.source_url, data.report, data.citations) }));
    const unclear = z.array(z.string()).catch([]).parse(j.unclear);
    const currency = typeof j.currency_code === "string" ? j.currency_code.toUpperCase() : null;
    let usdRate: number | null = null;
    if (currency) {
      try {
        if (currency === "USD") usdRate = 1;
        else {
          const fx = (await (await fetch("https://open.er-api.com/v6/latest/USD")).json()) as { rates?: Record<string, number> };
          usdRate = fx.rates?.[currency] ?? null;
        }
      } catch {
        usdRate = null;
      }
    }
    return { requirements: reqs, unclear, usdRate };
  });

export const recommend = createServerFn({ method: "POST" })
  .inputValidator((d) => llmInput.extend({ activity: z.string(), summary: z.string().max(100000) }).parse(d))
  .handler(async ({ data }) => {
    const system = `You advise a founder on where it is easiest to start an activity, based ONLY on the structured comparison given.
Weigh: number of steps, known government fees, time to approval, ongoing filings, and how many items are unclear/flagged. Unknowns count against certainty, never assume they are zero.
Return JSON: {"best_place": string|null, "summary": "2-4 sentences", "tradeoffs":[{"place","pros":[],"cons":[]}], "caveats":["things a lawyer must confirm"]}`;
    const j = await llmJson(data, system, `Activity: ${data.activity}\n\n${data.summary}`);
    return z
      .object({
        best_place: z.string().nullable().catch(null),
        summary: z.string().catch(""),
        tradeoffs: z.array(z.object({ place: z.string(), pros: z.array(z.string()).catch([]), cons: z.array(z.string()).catch([]) })).catch([]),
        caveats: z.array(z.string()).catch([]),
      })
      .parse(j);
  });
