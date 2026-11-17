import { useCallback, useEffect, useRef, useState } from "react";
import { computeTotals, flagRequirement, isTerminal, CATEGORIES, type Comparison, type PlaceResearch, type Requirement } from "./compass";
import { cancelResearch, findResearchRun, getResearch, recommend, startResearch, structureReport, verifySources } from "./compass.functions";
import { loadComparison, loadKeys, saveComparison, keysReady } from "./storage";

const TERMINAL_FAIL = ["FAILED", "CANCELLED", "TIMED_OUT"];
// 429: TinyResearch's concurrent-run cap (5 per user). 503: temporarily busy. Both are safe to retry on the next tick.
const RETRYABLE_START = /^TinyFish (429|503)\b/;

export function useComparison(id: string) {
  const [cmp, setCmp] = useState<Comparison | null | undefined>(undefined);
  const ref = useRef<Comparison | null>(null);
  const busy = useRef<Set<string>>(new Set());

  const update = useCallback(async (fn: (c: Comparison) => void) => {
    if (!ref.current) return;
    const next = structuredClone(ref.current);
    fn(next);
    ref.current = next;
    setCmp(next);
    await saveComparison(next);
  }, []);

  const setPlace = useCallback(
    (place: string, patch: Partial<PlaceResearch>) =>
      update((c) => {
        const p = c.places.find((x) => x.place === place);
        if (p) Object.assign(p, patch);
      }),
    [update],
  );

  // Pipeline results land only if the user hasn't cancelled the place while the call was in flight.
  const advance = useCallback(
    (place: string, patch: Partial<PlaceResearch>) =>
      update((c) => {
        const p = c.places.find((x) => x.place === place);
        if (p && p.status !== "cancelled") Object.assign(p, patch);
      }),
    [update],
  );

  const isCancelled = (place: string) => ref.current?.places.find((x) => x.place === place)?.status === "cancelled";

  useEffect(() => {
    loadComparison(id).then((c) => {
      ref.current = c ?? null;
      setCmp(c ?? null);
    });
  }, [id]);

  const step = useCallback(async () => {
    const c = ref.current;
    if (!c) return;
    const keys = loadKeys();
    if (!keysReady(keys)) return;
    const llm = { llmKey: keys.llmKey, baseUrl: keys.llmBaseUrl, model: keys.llmModel };
    const input = { key: keys.tinyfish, activity: c.activity, notes: c.notes };

    for (const p of c.places) {
      if (busy.current.has(p.place) || isTerminal(p.status)) continue;
      busy.current.add(p.place);
      try {
        if (p.status === "queued") {
          const found = p.startRequestedAt && !p.runId ? await findResearchRun({ data: { ...input, place: p.place, since: p.startRequestedAt } }) : null;
          if (found) {
            await advance(p.place, { runId: found.runId, status: "researching", runStatus: found.status, startedAt: p.startRequestedAt ?? new Date().toISOString() });
            continue;
          }
          const requestedAt = new Date().toISOString();
          await advance(p.place, { startRequestedAt: requestedAt });
          try {
            const { runId } = await startResearch({ data: { ...input, place: p.place } });
            if (isCancelled(p.place)) {
              await cancelResearch({ data: { key: keys.tinyfish, runId } }).catch(() => undefined);
              await setPlace(p.place, { runId, runStatus: "CANCELLED", startRequestedAt: null });
            } else {
              await advance(p.place, { runId, status: "researching", runStatus: "QUEUED", startedAt: requestedAt, startRequestedAt: null });
            }
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            await setPlace(p.place, { startRequestedAt: null });
            if (!RETRYABLE_START.test(msg)) throw e;
            await advance(p.place, { runStatus: "Waiting for a free TinyResearch slot" });
          }
        } else if (p.status === "researching" && p.runId) {
          const r = await getResearch({ data: { key: keys.tinyfish, runId: p.runId } });
          if (r.status === "COMPLETED" && r.report) {
            await advance(p.place, { status: "structuring", runStatus: r.status, report: r.report, citations: r.citations, progress: r.progress });
          } else if (TERMINAL_FAIL.includes(r.status) || (r.status === "COMPLETED" && !r.report)) {
            const status = r.status === "CANCELLED" ? "cancelled" : "failed";
            await advance(p.place, { status, runStatus: r.status, progress: r.progress, error: status === "failed" ? `Research ended: ${r.status}${r.error ? ` (${r.error})` : ""}` : null });
          } else {
            await advance(p.place, { runStatus: r.status, progress: r.progress });
          }
        } else if (p.status === "structuring" && p.report) {
          const s = await structureReport({ data: { ...llm, activity: c.activity, place: p.place, report: p.report, citations: p.citations } });
          const reqs: Requirement[] = s.requirements.map((r) => ({
            ...(r as Omit<Requirement, "checked_at" | "is_official" | "source_live" | "flags">),
            category: r.category as Requirement["category"],
            checked_at: null, is_official: false, source_live: null, flags: [],
          }));
          await advance(p.place, { status: "verifying", requirements: reqs, unclear: s.unclear, usdRate: s.usdRate });
        } else if (p.status === "verifying") {
          const urls = [...new Set(p.requirements.map((r) => r.source_url).filter((u): u is string => !!u && /^https?:\/\//.test(u)))].slice(0, 60);
          const v = urls.length ? await verifySources({ data: { key: keys.tinyfish, urls } }) : {};
          const now = new Date().toISOString();
          const reqs = p.requirements.map((r) => {
            const hit = r.source_url ? v[r.source_url] : undefined;
            return flagRequirement({ ...r, source_live: hit ? hit.live : r.source_url ? false : null, checked_at: hit?.checked_at ?? now });
          });
          await advance(p.place, { status: "done", requirements: reqs, finishedAt: now });
        }
      } catch (e) {
        await advance(p.place, { status: "failed", error: e instanceof Error ? e.message : String(e) });
      } finally {
        busy.current.delete(p.place);
      }
    }

    const cur = ref.current!;
    const done = cur.places.filter((p) => p.status === "done");
    const allTerminal = cur.places.every((p) => isTerminal(p.status));
    if (allTerminal && done.length >= 2 && !cur.recommendation && !cur.recommendationError && !busy.current.has("__rec")) {
      busy.current.add("__rec");
      try {
        const summary = done
          .map((p) => {
            const t = computeTotals(p);
            const rows = CATEGORIES.map((cat) => {
              const items = p.requirements.filter((r) => r.category === cat.id);
              return `  ${cat.label}: ${items.length ? items.map((r) => `${r.title} [fee ${r.cost_amount ?? "unknown"} ${r.currency ?? ""}; ${r.time_days ?? "unknown"} days; renewal ${r.renewal ?? "n/a"}${r.flags.length ? "; FLAGGED: " + r.flags.join(", ") : ""}]`).join("; ") : "NOT FOUND"}`;
            }).join("\n");
            return `PLACE ${p.place}: setup steps ${t.steps}, known fees ≈ ${t.upfrontKnown} ${t.upfrontCurrency} (+${t.upfrontUnknownCount} unknown), longest approval ${t.maxDays ?? "unknown"} days, ongoing items ${t.ongoingCount}, flagged ${t.flaggedCount}\n${rows}\n  Unclear: ${p.unclear.join("; ") || "none"}`;
          })
          .join("\n\n");
        const missing = cur.places.filter((p) => p.status !== "done").map((p) => p.place);
        const rec = await recommend({ data: { ...llm, activity: cur.activity, summary: summary + (missing.length ? `\n\nNo data (research failed or was cancelled): ${missing.join(", ")}` : "") } });
        await update((c) => { c.recommendation = rec; });
      } catch (e) {
        await update((c) => { c.recommendationError = e instanceof Error ? e.message : String(e); });
      } finally {
        busy.current.delete("__rec");
      }
    }
  }, [advance, setPlace, update]);

  useEffect(() => {
    if (!cmp) return;
    step();
    const t = setInterval(step, 10000);
    return () => clearInterval(t);
  }, [cmp?.id, step]); // eslint-disable-line react-hooks/exhaustive-deps

  const retry = useCallback(
    async (place: string) => {
      const p = ref.current?.places.find((x) => x.place === place);
      if (!p) return;
      const status = p.report ? "structuring" : p.runId && !TERMINAL_FAIL.includes(p.runStatus ?? "") ? "researching" : "queued";
      await update((c) => {
        c.recommendation = null;
        c.recommendationError = null;
        const x = c.places.find((y) => y.place === place)!;
        Object.assign(x, { status, error: null, ...(status === "queued" ? { runId: null, runStatus: null, progress: null, startRequestedAt: null } : {}) });
      });
      step();
    },
    [step, update],
  );

  const cancel = useCallback(
    async (places: string[]) => {
      const keys = loadKeys();
      const targets = (ref.current?.places ?? []).filter((p) => places.includes(p.place) && !isTerminal(p.status));
      await update((c) => {
        for (const x of c.places) if (targets.some((t) => t.place === x.place)) Object.assign(x, { status: "cancelled", error: null });
      });
      await Promise.all(
        targets.filter((p) => p.status === "researching" && p.runId).map(async (p) => {
          try {
            const r = await cancelResearch({ data: { key: keys.tinyfish, runId: p.runId! } });
            await setPlace(p.place, { runStatus: r.cancelled ? "CANCELLED" : r.status });
          } catch (e) {
            await setPlace(p.place, { error: `Couldn't cancel on TinyFish: ${e instanceof Error ? e.message : String(e)}` });
          }
        }),
      );
    },
    [setPlace, update],
  );

  const retryRecommendation = useCallback(async () => {
    await update((c) => { c.recommendation = null; c.recommendationError = null; });
    step();
  }, [step, update]);

  return { cmp, retry, cancel, retryRecommendation };
}
