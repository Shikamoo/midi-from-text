import type { Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { handlePlanRequest, readJsonBody } from './src/utils/localPlanner/planHandler.js';
import { checkOllamaAvailable } from './src/utils/localPlanner/ollamaClient.js';
import { isPlannerServerEnabled, resolveOllamaConfig } from './src/utils/localPlanner/config.js';
import type { PlanApiRequest } from './src/utils/localPlanner/types.js';

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

export function localPlannerPlugin(): Plugin {
  return {
    name: 'local-planner',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? '';

        if (url === '/api/plan/health' && req.method === 'GET') {
          const enabled = isPlannerServerEnabled();
          const ollama = enabled ? await checkOllamaAvailable(resolveOllamaConfig()) : false;
          sendJson(res, 200, { ok: enabled, ollama, enabled });
          return;
        }

        if (url === '/api/plan' && req.method === 'POST') {
          try {
            const body = await readJsonBody<PlanApiRequest>(req as IncomingMessage);
            const result = await handlePlanRequest(body);
            const status = result.ok ? 200 : result.code === 'disabled' ? 503 : 502;
            sendJson(res, status, result);
          } catch (err) {
            sendJson(res, 400, {
              ok: false,
              error: err instanceof Error ? err.message : 'Bad request',
              code: 'validation',
            });
          }
          return;
        }

        next();
      });
    },
  };
}
