# Local Ollama Planner

Optional local-first layer: natural-language prompt → **PlannerMusicPlan** (JSON) → existing generator **MusicPlan** → `planToScore` → MIDI.

> **Naming:** `PlannerMusicPlan` (`src/utils/localPlanner/schema.ts`) is the LLM output. `MusicPlan` (`src/types/musicPlan.ts`) is the existing generator input.

## Architecture

```
Prompt → POST /api/plan → Ollama (structured JSON)
  → MusicPlanSchema validation → mapToGeneratorPlan → planToScore → MIDI
```

On failure: API returns `{ ok: true, source: "fallback", plan }` derived from `promptToPlan`.

## Setup

```bash
# Install Ollama: https://ollama.com/download
ollama pull llama3.1:8b
ollama serve   # or use desktop app

cd midi-from-text
cp .env.example .env.local
# Set VITE_ENABLE_LOCAL_PLANNER=true
npm install
npm run dev
```

## Environment variables

| Variable | Default |
|----------|---------|
| `VITE_ENABLE_LOCAL_PLANNER` | `false` |
| `VITE_OLLAMA_BASE_URL` | `http://localhost:11434` |
| `VITE_OLLAMA_MODEL` | `llama3.1:8b` |
| `VITE_OLLAMA_TIMEOUT_MS` | `20000` |
| `VITE_OLLAMA_TEMPERATURE` | `0` |
| `ENABLE_LOCAL_PLANNER` | `true` (server kill switch) |

## API

### `POST /api/plan`

Request:
```json
{ "prompt": "playful retro game tune", "bars": 8, "temperature": 0, "seed": 42 }
```

Success (Ollama):
```json
{ "ok": true, "source": "ollama", "plan": { ... }, "model": "llama3.1:8b" }
```

Success (fallback):
```json
{ "ok": true, "source": "fallback", "plan": { ... }, "warning": "Ollama unavailable — ..." }
```

### `GET /api/plan/health`

Returns `{ "ok": true, "ollama": true, "enabled": true }`.

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Toggle missing | `VITE_ENABLE_LOCAL_PLANNER=true`, restart `npm run dev` |
| Unavailable | Start Ollama (`ollama serve`) |
| Model missing | `ollama pull <VITE_OLLAMA_MODEL>` |
| Timeout | Increase `VITE_OLLAMA_TIMEOUT_MS` or use smaller model |
| Fallback always | Normal when Ollama is down — rule-based parser still generates |

## Limitations

- Planner runs only in dev (`npm run dev`) via Vite middleware, or `npm run dev:planner` standalone.
- Production static build has no `/api/plan` unless you host the middleware separately.
- LLM plans are approximated into generator `MusicPlan` enums (documented in `mapToGeneratorPlan.ts`).

## Tests

```bash
npm test
```
