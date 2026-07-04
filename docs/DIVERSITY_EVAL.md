# Diversity evaluation

Offline QA harness that measures audible diversity across the full prompt → score pipeline **without changing the generator**.

## Run

```bash
npm run eval:diversity
```

This writes:

- [`diversity-eval-results.csv`](diversity-eval-results.csv) — per-prompt, per-pipeline metrics
- [`diversity-eval-comparisons.csv`](diversity-eval-comparisons.csv) — pairwise deltas between pipelines

Tests also cover the harness: `src/eval/diversityHarness.test.ts`.

## Pipelines measured

| Pipeline | Description |
|---|---|
| `legacy` | Rule-based `promptToPlan` → `planToScore` |
| `planner_same_seed` | Fixture `PlannerMusicPlan` → `mapToGeneratorPlan` (seed **42**) → `planToScore` |
| `planner_diff_seed` | Same fixture plan, seed **99** + `variationBoost` **0.25** |

Uses the five hand-authored diversity fixtures in `src/utils/localPlanner/__fixtures__/diversityPrompts.ts` (no live Ollama required).

## Metrics (from `ParsedScore`)

| Metric | Source | Easiest? |
|---|---|---|
| Pitch range / span | Melody token MIDI min/max | Yes — direct from tokens |
| Note density | Pitched notes ÷ total beats | Yes — token count + duration |
| Rest density | Rest beats ÷ total beats | Yes — rest durations |
| Interval histogram | Consecutive pitched MIDI steps | Small helper (`intervalSteps`) |
| Rhythm signature | Duration/rest sequence | Small helper (string compare) |
| Motif repetition sim | Bar *i* vs bar *i+phraseWindow* MIDI match | Reuses `barMidiSimilarity` |
| Harmony density / span | `harmonyTokens` per bar | Yes — optional track tokens |

## Layer impact summary

Mean absolute delta across the five fixture prompts (from latest eval run):

| Comparison | Pitch span | Note density | Rest density | Avg interval | Harmony density | Rhythm similarity |
|---|---:|---:|---:|---:|---:|---:|
| legacy → planner (same seed) | 2.2 | 0.34 | 0.09 | 0.77 | 2.4 | 0.46 |
| legacy → planner (diff seed) | 2.0 | 0.34 | 0.09 | 0.96 | 2.4 | 0.46 |
| planner same seed → diff seed | 0.6 | 0.00 | 0.00 | 0.23 | 0.0 | 1.00 |

### Which pipeline layer affects which metric most

| Metric | Most affected by | Notes |
|---|---|---|
| **Pitch range / span** | Planner mapping (register, scale, texture) | Largest legacy↔planner gap; seed alone is minor |
| **Note density** | Planner rhythm intent (`rhythmDensity`) | Legacy keyword parser vs continuous planner fields |
| **Rest density** | Planner rhythm + rest fields | Same layer as note density |
| **Interval distribution** | Melody intent (`leapRate`, scale type) | Visible in avg-interval deltas legacy↔planner |
| **Rhythm pattern similarity** | Planner + phrase development | Low cross-pipeline rhythm similarity (~0.46) |
| **Motif repetition similarity** | Phrase development (`repetition`, `variation`, `phraseBars`) | Seed-only changes are small when fixture plan is fixed |
| **Harmony density** | Texture + harmony scale path | Monophonic vs chordal textures dominate |

### Gaps / limitations

- **Live Ollama output** is not measured here — only deterministic fixture plans.
- **Seed variation** with a fixed fixture plan barely moves score metrics; real diversity from Ollama plan JSON would differ.
- **Bass track** metrics are not split out (only melody + harmony tokens today).
- **Interval histogram** is exported as a compact string, not full distribution columns.

## Files

| Path | Role |
|---|---|
| `src/eval/scoreMetrics.ts` | Metric computation from `ParsedScore` |
| `src/eval/diversityHarness.ts` | Pipeline runner + CSV helpers |
| `scripts/run-diversity-eval.ts` | CLI entry point |
