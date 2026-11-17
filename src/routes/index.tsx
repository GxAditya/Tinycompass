import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DEMOS, type Comparison } from "@/lib/compass";
import { clearDraft, keysReady, loadDraft, loadKeys, saveComparison, saveDraft } from "@/lib/storage";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "TinyCompass | Compare where to start a business" },
      { name: "description", content: "Enter an activity and three or more places to compare every licence, filing, cost and approval time from official government sources." },
      { property: "og:title", content: "TinyCompass | Where should I set up?" },
      { property: "og:description", content: "Licensing comparison across cities, states or countries, with official source links." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

function Index() {
  const nav = useNavigate();
  const [activity, setActivity] = useState("");
  const [notes, setNotes] = useState("");
  const [places, setPlaces] = useState(["", "", ""]);
  const [ready, setReady] = useState(true);
  const [demoOpen, setDemoOpen] = useState(false);
  const [draftLoaded, setDraftLoaded] = useState(false);
  useEffect(() => {
    setReady(keysReady(loadKeys()));
    const d = loadDraft();
    if (d) {
      setActivity(d.activity);
      setNotes(d.notes);
      setPlaces(d.places);
    }
    setDraftLoaded(true);
  }, []);
  useEffect(() => {
    if (draftLoaded) saveDraft({ activity, notes, places });
  }, [draftLoaded, activity, notes, places]);

  const start = async (a: string, ps: string[], n: string) => {
    const clean = ps.map((p) => p.trim()).filter(Boolean);
    if (!a.trim()) return toast.error("Enter an activity");
    if (new Set(clean.map((p) => p.toLowerCase())).size < 3) return toast.error("Enter at least three different places");
    if (!keysReady(loadKeys())) return toast.error("Add your API keys first");
    const c: Comparison = {
      id: crypto.randomUUID(),
      activity: a.trim(),
      notes: n.trim(),
      createdAt: new Date().toISOString(),
      recommendation: null,
      recommendationError: null,
      places: [...new Set(clean)].map((place) => ({
        place, status: "queued", runId: null, runStatus: null, error: null, report: null,
        citations: [], requirements: [], unclear: [], usdRate: null, startedAt: null, finishedAt: null,
      })),
    };
    await saveComparison(c);
    clearDraft();
    nav({ to: "/c/$id", params: { id: c.id } });
    return undefined;
  };

  return (
    <main className="mx-auto max-w-5xl px-6 py-14 text-center">
      <h1 className="text-4xl font-bold leading-tight text-primary sm:text-5xl md:text-6xl">Where should I set up?</h1>
      <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
        One activity, three or more places. Every licence, filing, fee and approval time is pulled live from official government sites, lined up side by side, ready to hand to your lawyer.
      </p>

      {!ready && (
        <div className="mx-auto mt-6 max-w-2xl rounded-md border border-brass bg-warning p-4 text-sm text-warning-foreground">
          Add your TinyFish and AI model keys before running a comparison. <Link to="/settings" className="font-semibold underline">Add keys</Link>
        </div>
      )}

      <section className="mx-auto mt-10 flex max-w-2xl flex-col items-center gap-6">
        <form
          className="w-full space-y-5 rounded-lg border bg-card p-6 shadow-sm"
          onSubmit={(e) => { e.preventDefault(); start(activity, places, notes); }}
        >
          <div>
            <label className="text-sm font-semibold">Activity</label>
            <Input className="mt-1.5" placeholder="e.g. Open a café, register a company, run a drone business" value={activity} onChange={(e) => setActivity(e.target.value)} maxLength={300} />
          </div>
          <div>
            <label className="text-sm font-semibold">Places to compare (cities, states or countries)</label>
            <div className="mt-1.5 space-y-2">
              {places.map((p, i) => (
                <div key={i} className="flex gap-2">
                  <span className="w-6 pt-2 text-right font-mono text-xs text-muted-foreground">{String.fromCharCode(65 + i)}</span>
                  <Input placeholder={["Austin, Texas", "Toronto, Ontario", "London, UK", "Singapore", "Dubai", "Berlin"][i]} value={p} maxLength={200}
                    onChange={(e) => setPlaces(places.map((x, j) => (j === i ? e.target.value : x)))} />
                  {places.length > 3 && (
                    <Button type="button" variant="ghost" onClick={() => setPlaces(places.filter((_, j) => j !== i))}>Remove</Button>
                  )}
                </div>
              ))}
            </div>
            {places.length < 6 && (
              <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => setPlaces([...places, ""])}>+ Add place</Button>
            )}
          </div>
          <div>
            <label className="text-sm font-semibold">Details (optional)</label>
            <Textarea className="mt-1.5" placeholder="Size, staff, premises, anything that changes the rules" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} />
          </div>
          <Button type="submit" size="lg" className="w-full">Compare places</Button>
          <p className="text-xs text-muted-foreground">Research takes about 5–20 minutes per place and runs in parallel. You can leave the page and come back from History.</p>
          <p className="text-xs text-muted-foreground">Each place uses one TinyResearch deep run on your TinyFish account. Per TinyFish's pricing, the first 2 completed runs each UTC day are free, then $2 per run. Up to 5 run at once; extra places wait for a slot.</p>
        </form>

        <aside className="flex w-full flex-col items-center gap-3">
          <Dialog open={demoOpen} onOpenChange={setDemoOpen}>
            <DialogTrigger asChild>
              <Button type="button" variant="outline" size="lg" className="min-w-48">Try a demo</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Try a demo</DialogTitle>
                <DialogDescription>Pick a ready-made comparison to see TinyCompass in action.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                {DEMOS.map((d) => (
                  <button key={d.activity} type="button" onClick={() => { setDemoOpen(false); start(d.activity, d.places, d.notes); }}
                    className="block w-full rounded-lg border bg-card p-4 text-left transition hover:border-primary">
                    <div className="font-display text-lg font-semibold text-primary">{d.activity}</div>
                    <div className="mt-1 font-mono text-xs text-muted-foreground">{d.places.join(" · ")}</div>
                  </button>
                ))}
              </div>
            </DialogContent>
          </Dialog>
          <p className="max-w-lg pt-2 text-xs text-muted-foreground">
            TinyCompass explains what is required to start. It does not check whether any person or business holds a licence, and it is not legal advice.
          </p>
        </aside>
      </section>
    </main>
  );
}
