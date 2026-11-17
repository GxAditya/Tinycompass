import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { LLM_PRESETS, OPENROUTER_BASE_URL, OPENROUTER_FREE_MODEL, loadKeys, saveKeys, type Keys } from "@/lib/storage";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "API keys | TinyCompass" },
      { name: "description", content: "Bring your own TinyFish and AI model keys. Stored only in your browser." },
      { property: "og:title", content: "API keys | TinyCompass" },
      { property: "og:description", content: "Bring your own keys for TinyCompass." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Settings,
});

function Settings() {
  const [k, setK] = useState<Keys | null>(null);
  const [paidModel, setPaidModel] = useState("");
  useEffect(() => setK(loadKeys()), []);
  if (!k) return null;
  const isOpenRouter = k.llmBaseUrl.replace(/\/$/, "") === OPENROUTER_BASE_URL;
  const freeRouter = isOpenRouter && k.llmModel === OPENROUTER_FREE_MODEL;
  const setFreeRouter = (on: boolean) => {
    if (on && k.llmModel !== OPENROUTER_FREE_MODEL) setPaidModel(k.llmModel);
    setK({ ...k, llmModel: on ? OPENROUTER_FREE_MODEL : paidModel });
  };
  return (
    <main className="mx-auto max-w-2xl px-6 py-14">
      <h1 className="text-4xl font-bold text-primary">Your API keys</h1>
      <p className="mt-3 text-muted-foreground">Keys are saved only in this browser and sent with each request. Nothing is stored on a server.</p>
      <form className="mt-8 space-y-6 rounded-lg border bg-card p-6" onSubmit={(e) => { e.preventDefault(); saveKeys(k); toast.success("Keys saved in this browser"); }}>
        <div>
          <label className="text-sm font-semibold">TinyFish API key</label>
          <Input type="password" className="mt-1.5 font-mono" value={k.tinyfish} onChange={(e) => setK({ ...k, tinyfish: e.target.value.trim() })} placeholder="sk-tinyfish-…" />
          <p className="mt-1 text-xs text-muted-foreground">From agent.tinyfish.ai → API keys. Research must be enabled on your account.</p>
        </div>
        <div>
          <label className="text-sm font-semibold">AI model provider</label>
          <div className="mt-1.5 grid grid-cols-2 gap-2">
            {LLM_PRESETS.map((p) => (
              <button type="button" key={p.label} onClick={() => setK({ ...k, llmBaseUrl: p.baseUrl, llmModel: p.model })}
                className={`rounded-md border p-2 text-left text-sm ${k.llmBaseUrl === p.baseUrl ? "border-primary bg-accent" : "bg-background"}`}>
                {p.label}
              </button>
            ))}
          </div>
          {isOpenRouter && (
            <div className="mt-3 flex items-start justify-between gap-4 rounded-md border bg-background p-3">
              <div>
                <label htmlFor="openrouter-free" className="text-sm font-semibold">Free models only</label>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Routes each request to an available free OpenRouter model that supports JSON output. Free models have lower rate limits, and the one used can change between requests.
                </p>
              </div>
              <Switch id="openrouter-free" checked={freeRouter} onCheckedChange={setFreeRouter} />
            </div>
          )}
        </div>
        <div>
          <label className="text-sm font-semibold">AI model API key</label>
          <Input type="password" className="mt-1.5 font-mono" value={k.llmKey} onChange={(e) => setK({ ...k, llmKey: e.target.value.trim() })} />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="text-sm font-semibold">Base URL (OpenAI-compatible)</label>
            <Input className="mt-1.5 font-mono text-xs" value={k.llmBaseUrl} onChange={(e) => setK({ ...k, llmBaseUrl: e.target.value.trim() })} />
          </div>
          <div>
            <label className="text-sm font-semibold">Model</label>
            <Input className="mt-1.5 font-mono text-xs" value={k.llmModel} disabled={freeRouter} placeholder={isOpenRouter ? "e.g. openai/gpt-4o-mini" : undefined} onChange={(e) => setK({ ...k, llmModel: e.target.value.trim() })} />
          </div>
        </div>
        <Button type="submit">Save keys</Button>
      </form>
    </main>
  );
}
