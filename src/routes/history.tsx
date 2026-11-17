import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { Comparison } from "@/lib/compass";
import { deleteComparison, listComparisons, saveComparison } from "@/lib/storage";

export const Route = createFileRoute("/history")({
  head: () => ({
    meta: [
      { title: "History | TinyCompass" },
      { name: "description", content: "Your saved licensing comparisons." },
      { property: "og:title", content: "History | TinyCompass" },
      { property: "og:description", content: "Saved TinyCompass comparisons." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: History,
});

function History() {
  const [list, setList] = useState<Comparison[] | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const refresh = () => listComparisons().then(setList);
  useEffect(() => { refresh(); }, []);

  const importFile = async (f: File) => {
    try {
      const c = JSON.parse(await f.text()) as Comparison;
      if (!c.id || !Array.isArray(c.places)) throw new Error();
      await saveComparison(c);
      toast.success("Comparison imported");
      refresh();
    } catch {
      toast.error("That file isn't a TinyCompass comparison");
    }
  };

  return (
    <main className="mx-auto max-w-4xl px-6 py-14">
      <div className="flex items-end justify-between">
        <h1 className="text-4xl font-bold text-primary">History</h1>
        <Button variant="outline" onClick={() => file.current?.click()}>Import JSON</Button>
        <input ref={file} type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />
      </div>
      <div className="mt-8 space-y-3">
        {list?.length === 0 && <p className="text-muted-foreground">No comparisons yet. <Link to="/" className="underline">Start one</Link>.</p>}
        {list?.map((c) => {
          const done = c.places.filter((p) => p.status === "done" || p.status === "failed" || p.status === "cancelled").length;
          return (
            <div key={c.id} className="flex items-center gap-4 rounded-lg border bg-card p-4">
              <Link to="/c/$id" params={{ id: c.id }} className="flex-1">
                <div className="font-display text-lg font-semibold text-primary">{c.activity}</div>
                <div className="font-mono text-xs text-muted-foreground">{c.places.map((p) => p.place).join(" · ")} · {new Date(c.createdAt).toLocaleString()} · {done}/{c.places.length} finished</div>
              </Link>
              <Button variant="ghost" size="sm" onClick={async () => { await deleteComparison(c.id); refresh(); }}>Delete</Button>
            </div>
          );
        })}
      </div>
    </main>
  );
}
