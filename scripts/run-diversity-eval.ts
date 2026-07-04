/**
 * Run diversity evaluation and write CSV results to docs/.
 * Usage: npm run eval:diversity
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildComparisons,
  metricsToCsvRow,
  comparisonToCsvRow,
  recordsToCsv,
  runFullEval,
  summarizeLayerImpact,
} from '../src/eval/diversityHarness.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const docsDir = join(root, 'docs');

const runs = runFullEval();
const comparisons = buildComparisons(runs);
const impact = summarizeLayerImpact(comparisons);

mkdirSync(docsDir, { recursive: true });

writeFileSync(
  join(docsDir, 'diversity-eval-results.csv'),
  recordsToCsv(runs.map(metricsToCsvRow)),
  'utf8',
);
writeFileSync(
  join(docsDir, 'diversity-eval-comparisons.csv'),
  recordsToCsv(comparisons.map(comparisonToCsvRow)),
  'utf8',
);

console.log(`Wrote ${runs.length} rows → docs/diversity-eval-results.csv`);
console.log(`Wrote ${comparisons.length} rows → docs/diversity-eval-comparisons.csv`);
console.log('\nLayer impact (mean absolute delta across fixtures):');
for (const row of impact) {
  console.log(
    `  ${row.comparison}: pitch_span=${row.avgPitchSpanDelta}, note_density=${row.avgNoteDensityDelta}, ` +
    `rest_density=${row.avgRestDensityDelta}, interval=${row.avgIntervalDelta}, ` +
    `harmony_density=${row.avgHarmonyDensityDelta}, rhythm_sim=${row.avgRhythmSimilarity}`,
  );
}
