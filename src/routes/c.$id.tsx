import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, type ReactNode } from "react";
import {
  ArrowSquareOutIcon, BracketsCurlyIcon, CheckIcon, DownloadSimpleIcon, MinusIcon, PlusIcon, PrinterIcon, SealCheckIcon, WarningIcon,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { ConfirmCancel, PlaceProgress } from "@/components/PlaceProgress";
import {
  CATEGORIES, computeTotals, flagRequirement, hostOf, isTerminal,
  type CategoryId, type Comparison, type PlaceResearch, type Requirement,
} from "@/lib/compass";
import { useComparison } from "@/lib/useRunner";

export const Route = createFileRoute("/c/$id")({
  head: () => ({
    meta: [
      { title: "Comparison | TinyCompass" },
      { name: "description", content: "Side-by-side licences, filings, costs and approval times from official government sources." },
      { property: "og:title", content: "Comparison | TinyCompass" },
      { property: "og:description", content: "Side-by-side licensing comparison with official sources." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ComparisonPage,
});

const ONGOING: CategoryId[] = ["renewals", "ongoing_filings"];
const GROUPS = [
  { title: "Getting started", note: "Everything needed before opening", ids: CATEGORIES.filter((c) => !ONGOING.includes(c.id)) },
  { title: "Keeping it running", note: "Renewals and recurring filings", ids: CATEGORIES.filter((c) => ONGOING.includes(c.id)) },
];

const fmtMoney = (n: number, cur: string) =>
  cur === "USD" ? `$${n.toLocaleString()}` : `${n.toLocaleString()} ${cur === "mixed" ? "(mixed currencies)" : cur}`;
const fmtDate = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "Not checked";

// Re-derive flags and the official-source check from stored fields, so saved comparisons pick up the current rules.
const normalize = (p: PlaceResearch): PlaceResearch => ({ ...p, requirements: (p.requirements ?? []).map(flagRequirement), unclear: p.unclear ?? [] });

const matchesBest = (best: string | null | undefined, place: string) => {
  if (!best) return false;
  const b = best.toLowerCase();
  const p = place.toLowerCase();
  return b === p || b.includes(p.split(",")[0]!.trim()) || p.includes(b);
};

function ComparisonPage() {
  const { id } = Route.useParams();
  const { cmp: raw, retry, cancel, retryRecommendation } = useComparison(id);
  const cmp = useMemo(() => (raw ? { ...raw, places: raw.places.map(normalize) } : raw), [raw]);

  if (cmp === undefined) return <main className="mx-auto max-w-7xl px-6 py-14 text-muted-foreground">Loading…</main>;
  if (cmp === null)
    return (
      <main className="mx-auto max-w-7xl px-6 py-14">
        <p>This comparison isn't saved in this browser. <Link to="/history" className="underline underline-offset-4">See history</Link></p>
      </main>
    );

  const done = cmp.places.filter((p) => p.status === "done");
  const pending = cmp.places.filter((p) => p.status !== "done");
  const running = cmp.places.some((p) => !isTerminal(p.status));
  const finished = cmp.places.filter((p) => isTerminal(p.status)).length;
  const cancellable = cmp.places.filter((p) => p.status === "queued" || p.status === "researching").map((p) => p.place);
  const lastChecked = done.map((p) => p.finishedAt).filter(Boolean).sort().at(-1);
  const best = cmp.recommendation?.best_place;

  return (
    <main className="report mx-auto max-w-7xl px-6 pb-16 pt-10">
      <header className="report-title flex flex-wrap items-end justify-between gap-6 border-b pb-6">
        <div className="min-w-0">
          <h1 className="text-4xl font-bold text-balance text-primary md:text-5xl">{cmp.activity}</h1>
          {cmp.notes && <p className="mt-2 max-w-2xl text-muted-foreground">{cmp.notes}</p>}
          <p className="mt-3 text-sm text-muted-foreground">
            {cmp.places.length} places · Started {fmtDate(cmp.createdAt)}
            {lastChecked ? ` · Sources checked ${fmtDate(lastChecked)}` : ""}
          </p>
        </div>
        <div className="no-print flex flex-wrap gap-2">
          <Button variant="outline" size="sm" disabled={!done.length} onClick={() => exportCsv(cmp)}><DownloadSimpleIcon aria-hidden="true" />CSV</Button>
          <Button variant="outline" size="sm" onClick={() => exportJson(cmp)}><BracketsCurlyIcon aria-hidden="true" />JSON</Button>
          <Button size="sm" disabled={!done.length} onClick={() => window.print()}><PrinterIcon aria-hidden="true" />Print for your lawyer</Button>
        </div>
      </header>

      {running && (
        <div className="stage-swap no-print mt-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3 text-sm">
          <div className="flex items-center gap-3">
            <span className="live-dot" aria-hidden="true" />
            <span><span className="font-semibold">{finished} of {cmp.places.length}</span> places finished. Progress is saved in this browser, so you can refresh or leave and come back.</span>
          </div>
          {cancellable.length > 1 && (
            <ConfirmCancel
              title="Cancel all running research?"
              description={`TinyFish will stop research for ${cancellable.join(", ")}. Cancelled runs aren't charged. Finished places are kept.`}
              onConfirm={() => cancel(cancellable)}
            >
              <Button size="sm" variant="outline">Cancel all</Button>
            </ConfirmCancel>
          )}
        </div>
      )}

      {pending.length > 0 && (
        <section className="no-print mt-6 grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }} aria-label="Research in progress">
          {pending.map((p, i) => (
            <div key={p.place} className="place-card rounded-lg border bg-card p-4" data-active={!isTerminal(p.status) || undefined} style={{ animationDelay: `${i * 60}ms` }}>
              <h2 className="text-lg font-semibold">{p.place}</h2>
              <PlaceProgress p={p} onCancel={() => cancel([p.place])} onRetry={() => retry(p.place)} />
            </div>
          ))}
        </section>
      )}

      <Recommendation cmp={cmp} running={running} onRetry={retryRecommendation} />

      {done.length > 0 && (
        <>
          <AtAGlance places={cmp.places} best={best} />
          <Requirements places={cmp.places} best={best} />
        </>
      )}

      <footer className="mt-14 border-t pt-5 text-xs leading-relaxed text-muted-foreground">
        <p className="max-w-3xl">
          Compiled from official government websites on the dates shown. Anything marked "Not stated" wasn't published on an official source and has not been estimated.
          Use this as a starting point for a qualified lawyer to confirm. It is not legal advice, and TinyCompass does not check whether any person or business holds a licence.
        </p>
      </footer>
    </main>
  );
}

function SectionHeading({ id, title, children }: { id: string; title: string; children?: ReactNode }) {
  return (
    <div className="report-heading mb-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
      <h2 id={id} className="text-2xl font-bold text-foreground">{title}</h2>
      {children && <p className="text-sm text-muted-foreground">{children}</p>}
    </div>
  );
}

function Recommendation({ cmp, running, onRetry }: { cmp: Comparison; running: boolean; onRetry: () => void }) {
  const r = cmp.recommendation;
  if (!r && !cmp.recommendationError)
    return running ? <p className="mt-8 text-sm text-muted-foreground">The recommendation appears once every place has finished.</p> : null;
  if (!r)
    return (
      <div className="mt-8 flex flex-wrap items-center gap-3 rounded-lg border border-destructive/40 bg-card p-4 text-sm">
        <WarningIcon className="text-destructive" size={18} aria-hidden="true" />
        <span className="flex-1">Couldn't write the recommendation: {cmp.recommendationError}</span>
        <Button size="sm" variant="outline" onClick={onRetry}>Try again</Button>
      </div>
    );
  return (
    <section className="rec stage-swap mt-10 overflow-hidden rounded-xl border bg-card" aria-labelledby="rec-title">
      <div className="rec-lead bg-primary px-6 py-7 text-primary-foreground md:px-8">
        <h2 id="rec-title" className="text-3xl font-bold text-balance md:text-4xl">{r.best_place ? `Start in ${r.best_place}` : "No clear winner"}</h2>
        <p className="mt-3 max-w-[68ch] leading-relaxed text-primary-foreground/85">{r.summary}</p>
      </div>
      {r.tradeoffs.length > 0 && (
        <div className="grid divide-y md:divide-x md:divide-y-0" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(240px, 1fr))` }}>
          {r.tradeoffs.map((t) => (
            <div key={t.place} className="rec-trade px-6 py-5 md:px-8">
              <h3 className="flex items-center gap-2 font-display text-lg font-semibold">
                {t.place}
                {matchesBest(r.best_place, t.place) && <SealCheckIcon className="text-brass" size={18} weight="fill" aria-label="Recommended" />}
              </h3>
              <ul className="mt-3 space-y-2 text-sm">
                {t.pros.map((x, i) => (
                  <li key={`p${i}`} className="flex gap-2"><PlusIcon className="mt-0.5 shrink-0 text-success" size={14} weight="bold" aria-label="Advantage" /><span>{x}</span></li>
                ))}
                {t.cons.map((x, i) => (
                  <li key={`c${i}`} className="flex gap-2 text-muted-foreground"><MinusIcon className="mt-0.5 shrink-0 text-destructive" size={14} weight="bold" aria-label="Drawback" /><span>{x}</span></li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      {r.caveats.length > 0 && (
        <div className="rec-caveats border-t bg-secondary/50 px-6 py-5 md:px-8">
          <h3 className="text-sm font-semibold">For your lawyer to confirm</h3>
          <ul className="mt-2 grid gap-x-8 gap-y-1.5 text-sm text-muted-foreground md:grid-cols-2">
            {r.caveats.map((c, i) => <li key={i} className="flex gap-2"><span className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground" aria-hidden="true" />{c}</li>)}
          </ul>
        </div>
      )}
    </section>
  );
}

function PlaceHead({ p, best }: { p: PlaceResearch; best: string | null | undefined }) {
  const isBest = p.status === "done" && matchesBest(best, p.place);
  return (
    <th scope="col" className="report-th" data-best={isBest || undefined}>
      <span className="block font-display text-base font-semibold text-foreground">{p.place}</span>
      <span className={`mt-0.5 flex items-center gap-1 text-xs font-medium ${isBest ? "text-brass" : "text-muted-foreground"}`}>
        {isBest ? <><SealCheckIcon size={13} weight="fill" aria-hidden="true" />Recommended</> : p.status === "done" ? `Checked ${fmtDate(p.finishedAt)}` : p.status === "cancelled" ? "Cancelled" : p.status === "failed" ? "No data" : "Researching"}
      </span>
    </th>
  );
}

function AtAGlance({ places, best }: { places: PlaceResearch[]; best: string | null | undefined }) {
  const totals = places.map((p) => (p.status === "done" ? computeTotals(p) : null));
  const rows: { label: string; hint: string; cell: (t: ReturnType<typeof computeTotals>, p: PlaceResearch) => ReactNode }[] = [
    {
      label: "Known setup fees", hint: "Government fees only",
      cell: (t) => (
        <>
          <span className="report-num">{t.steps ? fmtMoney(t.upfrontKnown, t.upfrontCurrency) : "None"}</span>
          {t.upfrontUnknownCount > 0 && <Gap>{t.upfrontUnknownCount} fee{t.upfrontUnknownCount === 1 ? "" : "s"} not stated</Gap>}
        </>
      ),
    },
    {
      label: "Longest approval", hint: "Slowest setup step",
      cell: (t) => (
        <>
          <span className="report-num">{t.maxDays !== null ? `${t.maxDays} day${t.maxDays === 1 ? "" : "s"}` : "Not stated"}</span>
          {t.maxDays !== null && t.daysUnknownCount > 0 && <Gap>{t.daysUnknownCount} time{t.daysUnknownCount === 1 ? "" : "s"} not stated</Gap>}
        </>
      ),
    },
    { label: "Setup steps", hint: "Licences, registrations, permits", cell: (t) => <span className="report-num">{t.steps}</span> },
    { label: "Ongoing obligations", hint: "Renewals and filings", cell: (t) => <span className="report-num">{t.ongoingCount}</span> },
    {
      label: "Official sources", hint: "Share of items",
      cell: (t, p) => <span className="report-num">{p.requirements.length ? `${Math.round(t.officialShare * 100)}%` : "—"}</span>,
    },
    {
      label: "Needs a closer look", hint: "Items with a gap or flag",
      cell: (t, p) => (
        <span className={`report-num ${t.flaggedCount ? "text-warning-foreground" : ""}`}>
          {t.flaggedCount}<span className="font-sans text-xs font-normal text-muted-foreground"> of {p.requirements.length}</span>
        </span>
      ),
    },
  ];
  return (
    <section className="report-section stage-swap mt-12" aria-labelledby="glance-title">
      <SectionHeading id="glance-title" title="At a glance">Totals use only amounts published on official sources.</SectionHeading>
      <div className="report-scroll">
        <table className="report-table report-compact" style={{ minWidth: 210 + places.length * 260 }}>
          <thead>
            <tr>
              <th scope="col" className="report-th report-rowhead"><span className="sr-only">Measure</span></th>
              {places.map((p) => <PlaceHead key={p.place} p={p} best={best} />)}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <th scope="row" className="report-rowhead">
                  <span className="block text-sm font-semibold text-foreground">{row.label}</span>
                  <span className="block text-xs font-normal text-muted-foreground">{row.hint}</span>
                </th>
                {places.map((p, i) => (
                  <td key={p.place} className="report-td" data-best={(p.status === "done" && matchesBest(best, p.place)) || undefined}>
                    {totals[i] ? <div className="flex flex-col gap-0.5">{row.cell(totals[i]!, p)}</div> : <span className="text-sm text-muted-foreground">—</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Requirements({ places, best }: { places: PlaceResearch[]; best: string | null | undefined }) {
  return (
    <section className="report-section stage-swap mt-14" aria-labelledby="req-title">
      <SectionHeading id="req-title" title="Requirement by requirement">Every item links to the official page it came from. Empty cells mean nothing was found, so confirm with the authority.</SectionHeading>
      <div className="report-scroll report-screen">
        <table className="report-table" style={{ minWidth: 210 + places.length * 260 }}>
          <thead>
            <tr>
              <th scope="col" className="report-th report-rowhead"><span className="sr-only">Category</span></th>
              {places.map((p) => <PlaceHead key={p.place} p={p} best={best} />)}
            </tr>
          </thead>
          {GROUPS.map((g) => (
            <tbody key={g.title}>
              <tr className="report-group">
                <th scope="colgroup" colSpan={places.length + 1}>
                  <span className="font-display text-base font-semibold text-foreground">{g.title}</span>
                  <span className="ml-3 text-xs font-normal text-muted-foreground">{g.note}</span>
                </th>
              </tr>
              {g.ids.map((cat) => (
                <tr key={cat.id}>
                  <th scope="row" className="report-rowhead text-sm font-semibold text-foreground">{cat.label}</th>
                  {places.map((p) => (
                    <td key={p.place} className="report-td" data-best={(p.status === "done" && matchesBest(best, p.place)) || undefined}>
                      {p.status !== "done" ? <span className="text-sm text-muted-foreground">—</span> : <Items items={p.requirements.filter((r) => r.category === cat.id)} />}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          ))}
          <tbody>
            <tr>
              <th scope="row" className="report-rowhead">
                <span className="block text-sm font-semibold text-foreground">Unclear rules</span>
                <span className="block text-xs font-normal text-muted-foreground">Not published, or conflicting</span>
              </th>
              {places.map((p) => (
                <td key={p.place} className="report-td" data-best={(p.status === "done" && matchesBest(best, p.place)) || undefined}>
                  {p.status !== "done" ? <span className="text-sm text-muted-foreground">—</span> : p.unclear.length ? <UnclearList items={p.unclear} /> : <span className="text-sm text-muted-foreground">None reported</span>}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <PrintRequirements places={places} best={best} />
    </section>
  );
}

function Gap({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-warning-foreground">
      <WarningIcon size={12} weight="bold" aria-hidden="true" />{children}
    </span>
  );
}

function Fact({ label, value, missing, gap = true }: { label: string; value: string | null; missing: string; gap?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className={value !== null ? "report-num text-sm" : gap ? "text-sm text-warning-foreground" : "text-sm text-muted-foreground"}>{value ?? missing}</dd>
    </div>
  );
}

const NOT_FOUND = <p className="text-sm text-muted-foreground/80">Not found on official sources</p>;

function Items({ items }: { items: Requirement[] }) {
  if (!items.length) return NOT_FOUND;
  return <div className="report-items">{items.map((r, i) => <Item key={i} r={r} />)}</div>;
}

function UnclearList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2 text-sm">
      {items.map((u, i) => (
        <li key={i} className="flex gap-2"><WarningIcon className="mt-0.5 shrink-0 text-warning-foreground" size={14} aria-hidden="true" /><span>{u}</span></li>
      ))}
    </ul>
  );
}

// Print layout: one table row per record (item k of every place), so pages break between records, never inside one.
function PrintRequirements({ places, best }: { places: PlaceResearch[]; best: string | null | undefined }) {
  const isBest = (p: PlaceResearch) => (p.status === "done" && matchesBest(best, p.place)) || undefined;
  const cols = places.length;
  const records = (lists: (unknown[] | null)[]) => Math.max(1, ...lists.map((l) => l?.length ?? 0));
  return (
    <table className="report-table report-print" aria-hidden="true">
      <thead>
        <tr>{places.map((p) => <PlaceHead key={p.place} p={p} best={best} />)}</tr>
      </thead>
      {GROUPS.map((g) => (
        <tbody key={g.title}>
          <tr className="report-group"><th colSpan={cols}><span className="font-display text-sm font-semibold">{g.title}</span></th></tr>
          {g.ids.map((cat) => {
            const lists = places.map((p) => (p.status === "done" ? p.requirements.filter((r) => r.category === cat.id) : null));
            return [
              <tr key={cat.id} className="report-cat"><th colSpan={cols}>{cat.label}</th></tr>,
              ...Array.from({ length: records(lists) }, (_, k) => (
                <tr key={`${cat.id}-${k}`} className="report-record">
                  {places.map((p, i) => {
                    const list = lists[i];
                    return (
                      <td key={p.place} className="report-td" data-best={isBest(p)}>
                        {!list ? (k === 0 ? <span className="text-sm text-muted-foreground">—</span> : null) : list[k] ? <Item r={list[k]!} context={k > 0 ? cat.label : undefined} /> : k === 0 ? NOT_FOUND : null}
                      </td>
                    );
                  })}
                </tr>
              )),
            ];
          })}
        </tbody>
      ))}
      <tbody>
        <tr className="report-cat"><th colSpan={cols}>Unclear rules</th></tr>
        <tr className="report-record">
          {places.map((p) => (
            <td key={p.place} className="report-td" data-best={isBest(p)}>
              {p.status !== "done" ? "—" : p.unclear.length ? <UnclearList items={p.unclear} /> : <span className="text-sm text-muted-foreground">None reported</span>}
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  );
}

function Item({ r, context }: { r: Requirement; context?: string | undefined }) {
  const otherFlags = r.flags.filter((f) => !/^Cost not stated|^Time to approval not stated/.test(f));
  return (
          <article className="report-item">
            {context && <p className="report-context text-muted-foreground">{context}</p>}
            <h3 className="text-sm font-semibold leading-snug text-foreground">{r.title}</h3>
            {r.authority && <p className="mt-0.5 text-xs text-muted-foreground">{r.authority}</p>}
            {r.description && <p className="mt-1.5 text-xs leading-relaxed text-foreground/80">{r.description}</p>}
            <dl className="mt-2.5 grid grid-cols-3 gap-2">
              <Fact label="Fee" value={r.cost_amount !== null ? `${r.cost_amount.toLocaleString()}${r.currency ? ` ${r.currency}` : ""}` : null} missing="Not stated" />
              <Fact label="Approval" value={r.time_days !== null ? `${r.time_days} day${r.time_days === 1 ? "" : "s"}` : null} missing="Not stated" />
              <Fact label="Renews" value={r.renewal} missing="—" gap={false} />
            </dl>
            {(r.cost_note || r.time_note) && <p className="mt-1.5 text-xs text-muted-foreground">{[r.cost_note, r.time_note].filter(Boolean).join(" · ")}</p>}
            <div className="mt-2.5 flex flex-col items-start gap-1 text-xs">
              {r.source_url ? (
                <a href={r.source_url} target="_blank" rel="noreferrer" className={`report-source ${r.is_official ? "" : "is-unofficial"}`}>
                  {r.is_official && <SealCheckIcon size={13} weight="fill" aria-label="Official source" />}
                  <span className="truncate">{hostOf(r.source_url) ?? r.source_url}</span>
                  <ArrowSquareOutIcon size={12} aria-hidden="true" />
                </a>
              ) : null}
              <span className="text-muted-foreground">
                Checked {fmtDate(r.checked_at)}
                {r.source_live === true && <><CheckIcon className="ml-1 inline text-success" size={11} weight="bold" aria-hidden="true" /> page live</>}
              </span>
            </div>
            {otherFlags.length > 0 && (
              <ul className="mt-2 space-y-1">
                {otherFlags.map((f) => <li key={f}><Gap>{f}</Gap></li>)}
              </ul>
            )}
          </article>
  );
}

function download(name: string, text: string, type: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

function exportJson(c: Comparison) {
  download(`tinycompass-${c.activity.replace(/\W+/g, "-")}.json`, JSON.stringify(c, null, 2), "application/json");
}

function exportCsv(c: Comparison) {
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = [["Place", "Category", "Requirement", "Authority", "Fee", "Currency", "Days", "Renewal", "Source", "Official", "Checked", "Flags"]];
  for (const p of c.places)
    for (const r of p.requirements)
      rows.push([p.place, CATEGORIES.find((x) => x.id === r.category)?.label ?? r.category, r.title, r.authority ?? "", r.cost_amount === null ? "NOT STATED" : String(r.cost_amount), r.currency ?? "", r.time_days === null ? "NOT STATED" : String(r.time_days), r.renewal ?? "", r.source_url ?? "", r.is_official ? "yes" : "no", r.checked_at ?? "", r.flags.join("; ")]);
  download(`tinycompass-${c.activity.replace(/\W+/g, "-")}.csv`, rows.map((r) => r.map(esc).join(",")).join("\n"), "text/csv");
}
