import { useEffect, useState, type ReactNode } from "react";
import { CheckIcon, MagnifyingGlassIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { PlaceResearch, PlaceStatus } from "@/lib/compass";

const STEPS = ["Start", "Research", "Line up", "Verify"] as const;
const STEP_INDEX: Record<PlaceStatus, number> = { queued: 0, researching: 1, structuring: 2, verifying: 3, done: 4, failed: -1, cancelled: -1 };

const STAGE: Record<"queued" | "researching" | "structuring" | "verifying", { title: string; body: string }> = {
  queued: {
    title: "Starting TinyResearch",
    body: "Sending the question to TinyResearch, with official government domains given priority.",
  },
  researching: {
    title: "Researching official sites",
    body: "TinyResearch is searching and reading government and regulator sites for every licence, filing, fee and approval time. Deep runs usually take 5–20 minutes.",
  },
  structuring: {
    title: "Lining up requirements",
    body: "Your AI model is sorting the cited report into the same 10 categories used for every place. Links that aren't in the research are dropped, and missing fees or times are left blank.",
  },
  verifying: {
    title: "Re-checking every source",
    body: "TinyFish Fetch is reopening each source page to confirm it's live and record the date it was checked.",
  },
};

const RUN_STATUS_LABEL: Record<string, string> = { QUEUED: "Waiting for a research worker", RUNNING: "Running" };

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

const fmtElapsed = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export function ConfirmCancel({ title, description, onConfirm, children }: { title: string; description: string; onConfirm: () => void; children: ReactNode }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep running</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Cancel research</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function PlaceProgress({ p, onCancel, onRetry }: { p: PlaceResearch; onCancel: () => void; onRetry: () => void }) {
  const active = p.status !== "failed" && p.status !== "cancelled" && p.status !== "done";
  const now = useNow(active);
  const idx = STEP_INDEX[p.status];

  if (!active) {
    const cancelled = p.status === "cancelled";
    return (
      <div key={p.status} className="stage-swap mt-3 text-sm">
        <div className={cancelled ? "font-medium text-muted-foreground" : "font-medium text-destructive"}>{cancelled ? "Cancelled" : "Failed"}</div>
        <p className="mt-1 text-xs text-muted-foreground">
          {cancelled ? (p.report ? "Research finished before you cancelled. Resume to line up the results." : "Research was stopped. Restart to run it again.") : null}
        </p>
        {p.error && <div className="mt-1 break-words text-xs text-destructive">{p.error}</div>}
        <Button size="sm" variant="outline" className="no-print mt-3" onClick={onRetry}>{cancelled ? (p.report ? "Resume" : "Restart") : "Retry"}</Button>
      </div>
    );
  }

  const stage = STAGE[p.status as keyof typeof STAGE];
  const fill = (idx + 0.5) / STEPS.length;
  const prog = p.progress;
  const elapsed = p.startedAt ? now - new Date(p.startedAt).getTime() : null;

  return (
    <div className="mt-3 text-sm" aria-live="polite">
      <ol className="step-row" aria-label="Progress">
        {STEPS.map((s, i) => {
          const state = i < idx ? "done" : i === idx ? "active" : "todo";
          return (
            <li key={s} className="step" data-state={state} aria-current={state === "active" ? "step" : undefined}>
              <span className="step-dot">{state === "done" ? <CheckIcon size={10} weight="bold" aria-hidden="true" /> : null}</span>
              <span className="step-label">{s}</span>
            </li>
          );
        })}
      </ol>
      <div className="progress-track mt-2" aria-hidden="true">
        <div className="progress-fill" style={{ transform: `scaleX(${fill})` }} />
      </div>

      <div key={p.status} className="stage-swap mt-3">
        <div className="flex items-baseline justify-between gap-2">
          <div className="font-semibold">{stage.title}</div>
          {p.status === "researching" && elapsed !== null && <span className="font-mono text-xs tabular-nums text-muted-foreground">{fmtElapsed(elapsed)}</span>}
        </div>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{stage.body}</p>

        {(p.status === "queued" || p.status === "researching") && p.runStatus && (
          <div className="mt-2 font-mono text-[11px] text-muted-foreground">TinyResearch: {RUN_STATUS_LABEL[p.runStatus] ?? p.runStatus}</div>
        )}

        {p.status === "researching" && prog && (prog.sources > 0 || prog.plan.length > 0 || prog.iterations) ? (
          <div className="mt-2 space-y-2">
            <div className="flex flex-wrap gap-x-3 font-mono text-[11px] text-muted-foreground">
              {prog.iterations ? <span>Pass {prog.iterations}</span> : null}
              {prog.sources > 0 && <span>{prog.sources} source{prog.sources === 1 ? "" : "s"} read</span>}
            </div>
            {prog.plan.length > 0 && (
              <ul className="space-y-1 text-xs">
                {prog.plan.slice(0, 2).map((q, i) => (
                  <li key={q} className="chip-in flex gap-1.5" style={{ animationDelay: `${i * 50}ms` }}>
                    <MagnifyingGlassIcon className="mt-0.5 shrink-0 text-brass" size={12} weight="bold" aria-hidden="true" />
                    <span className="line-clamp-2">{q}</span>
                  </li>
                ))}
              </ul>
            )}
            {prog.hosts.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {prog.hosts.map((h, i) => (
                  <span key={h} className="chip-in rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-secondary-foreground" style={{ animationDelay: `${i * 40}ms` }}>{h}</span>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </div>

      {(p.status === "queued" || p.status === "researching") && (
        <ConfirmCancel
          title={`Cancel research for ${p.place}?`}
          description="TinyFish will stop this research run. Cancelled runs aren't charged. You can restart it later."
          onConfirm={onCancel}
        >
          <Button size="sm" variant="ghost" className="no-print mt-3 -ml-2 text-muted-foreground hover:text-destructive">Cancel</Button>
        </ConfirmCancel>
      )}
    </div>
  );
}
