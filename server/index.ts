/**
 * Standalone local planner server (optional — Vite dev middleware is preferred).
 *
 * Usage: npx tsx server/index.ts
 */

import http from 'node:http';
import { handlePlanRequest, readJsonBody } from '../src/utils/localPlanner/planHandler.ts';
import { checkOllamaAvailable } from '../src/utils/localPlanner/ollamaClient.ts';
import { isPlannerServerEnabled, resolveOllamaConfig } from '../src/utils/localPlanner/config.ts';
import type { PlanApiRequest } from '../src/utils/localPlanner/types.ts';

const PORT = Number(process.env.PLANNER_PORT ?? 8787);

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = req.url ?? '/';

  if (req.method === 'GET' && url === '/api/plan/health') {
    const enabled = isPlannerServerEnabled();
    const ollama = enabled ? await checkOllamaAvailable(resolveOllamaConfig()) : false;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: enabled, ollama, enabled }));
    return;
  }

  if (req.method === 'POST' && url === '/api/plan') {
    try {
      const body = await readJsonBody<PlanApiRequest>(req);
      const result = await handlePlanRequest(body);
      const status = result.ok ? 200 : result.code === 'disabled' ? 503 : 502;
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: false,
        error: err instanceof Error ? err.message : 'Bad request',
        code: 'validation',
      }));
    }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: false, error: 'Not found' }));
});

server.listen(PORT, () => {
  console.log(`Local planner server listening on http://localhost:${PORT}`);
  console.log(`  POST /api/plan`);
  console.log(`  GET  /api/plan/health`);
});
