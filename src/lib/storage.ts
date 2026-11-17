// Browser-only persistence. Call only from effects/handlers.
import { get, set, del, keys } from "idb-keyval";
import type { Comparison } from "./compass";

const PREFIX = "cmp:";

export async function saveComparison(c: Comparison) {
  await set(PREFIX + c.id, c);
}
export async function loadComparison(id: string) {
  return (await get(PREFIX + id)) as Comparison | undefined;
}
export async function deleteComparison(id: string) {
  await del(PREFIX + id);
}
export async function listComparisons(): Promise<Comparison[]> {
  const ks = (await keys()).filter((k) => String(k).startsWith(PREFIX));
  const all = await Promise.all(ks.map((k) => get(k)));
  return (all.filter(Boolean) as Comparison[]).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export interface Keys {
  tinyfish: string;
  llmKey: string;
  llmBaseUrl: string;
  llmModel: string;
}

export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
// OpenRouter's Free Models Router: picks an available free model that supports the request (e.g. JSON output).
export const OPENROUTER_FREE_MODEL = "openrouter/free";

export const LLM_PRESETS = [
  { label: "Google Gemini (free tier)", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", model: "gemini-2.5-flash" },
  { label: "Groq (free tier)", baseUrl: "https://api.groq.com/openai/v1", model: "llama-3.3-70b-versatile" },
  { label: "OpenRouter", baseUrl: OPENROUTER_BASE_URL, model: OPENROUTER_FREE_MODEL },
  { label: "OpenAI", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
];

const KEYS = "tinycompass:keys";
const DEF = LLM_PRESETS[0]!;
export function loadKeys(): Keys {
  try {
    const v = JSON.parse(localStorage.getItem(KEYS) ?? "{}");
    return { tinyfish: "", llmKey: "", llmBaseUrl: DEF.baseUrl, llmModel: DEF.model, ...v };
  } catch {
    return { tinyfish: "", llmKey: "", llmBaseUrl: DEF.baseUrl, llmModel: DEF.model };
  }
}
export function saveKeys(k: Keys) {
  localStorage.setItem(KEYS, JSON.stringify(k));
}
export interface Draft {
  activity: string;
  notes: string;
  places: string[];
}

const DRAFT = "tinycompass:draft";
export function loadDraft(): Draft | null {
  try {
    const v = JSON.parse(localStorage.getItem(DRAFT) ?? "null") as Draft | null;
    return v && typeof v.activity === "string" && Array.isArray(v.places) && v.places.length >= 3 ? v : null;
  } catch {
    return null;
  }
}
export function saveDraft(d: Draft) {
  localStorage.setItem(DRAFT, JSON.stringify(d));
}
export function clearDraft() {
  localStorage.removeItem(DRAFT);
}

export function keysReady(k: Keys) {
  return !!(k.tinyfish && k.llmKey && k.llmBaseUrl && k.llmModel);
}
