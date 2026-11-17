- **Generated files.** Do not edit a file whose header says it is automatically generated.
- **Secrets.** Do not put secret values in the repo.

## Commands
- Package manager is npm (commit package-lock.json; no bun/pnpm/yarn lockfiles). `.npmrc` keeps a 1-day `min-release-age` supply-chain guard.
- `npm run build`, `npm test`, `npx tsc --noEmit` for verification.
- `npm run preview` runs the built Worker locally with wrangler; `npm run deploy` deploys to Cloudflare Workers.
- Deploy target is Nitro's `cloudflare-module` preset (configured in vite.config.ts); keep the bundle within the Workers free plan (3 MB compressed).

## TinyCompass architecture
- No backend database or auth: comparisons live in browser IndexedDB (src/lib/storage.ts) — user requested no Cloud/no login.
- BYOK: TinyFish and OpenAI-compatible LLM keys stay in localStorage and are passed per call to server functions in src/lib/compass.functions.ts; never persist keys server-side.
- Official-source and gap-flagging rules live in pure src/lib/compass.ts with tests; never fill unknown fees/times with estimates.
- TinyResearch: async start + poll `GET /v1/research-run/{id}`; cancel via `POST .../cancel`. Async starts aren't idempotent, so `startRequestedAt` is persisted and `findResearchRun` recovers the run after a refresh instead of starting a second, billed run. 429/503 on start = stay queued and retry.
- Every requirement's `source_url` must appear in the TinyResearch report or citations (`groundSourceUrl`); the research query must stay ≤ 2,000 chars.
- Processing-stage motion lives in styles.css (`.stage-swap`, `.step`, `.progress-fill`, `--ease-out`/`--ease-in-out` tokens) with a reduced-motion block.
- Keep shared navigation and pathname-keyed page entrance transitions in the root layout; CSS handles motion with a reduced-motion fallback so all routes stay consistent without a separate animation runtime.
