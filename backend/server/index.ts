import express, { Express } from 'express';
import { healthRouter } from './routes/health.js';
import { validateImageRouter } from './routes/validateImage.js';
import { parseQueryRouter } from './routes/parseQuery.js';
import { routeTaskRouter } from './routes/routeTask.js';
import { executeTaskRouter } from './routes/executeTask.js';
import { modelAuditRouter } from './routes/modelAudit.js';
import { catalogRouter } from './routes/catalog.js';
import { analyzeRouter } from './routes/analyze.js';
import { requireApiKey } from './security/accessControl.js';
import {
  apiNotFound,
  apiRateLimit,
  corsPolicy,
  enforceHttps,
  jsonErrorHandler,
  parseTrustProxy,
  requestId,
  securityHeaders
} from './security/secureDefaults.js';

export function createServerApp(): Express {
  const app = express();

  // Never advertise the framework. Trust-proxy hops are operator-configured
  // (TRUST_PROXY); unset means Express defaults (direct peer, no XFF trust).
  app.disable('x-powered-by');
  const trustProxyHops = parseTrustProxy();
  if (trustProxyHops !== undefined) {
    app.set('trust proxy', trustProxyHops);
  }

  // Request pipeline: correlation -> transport hardening -> CORS -> HTTPS ->
  // rate limit (before body parsing, so floods are cheap to shed).
  app.use(requestId);
  app.use(securityHeaders);
  app.use(corsPolicy);
  app.use(enforceHttps);
  app.use(apiRateLimit);

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // API Routes
  // /api/health stays unauthenticated (load-balancer / readiness probes).
  // All other /api/* routes pass through the API-key gate, which enforces
  // `Authorization: Bearer <SATQUERY_API_KEY>` only when that env var is set.
  app.use('/api/health', healthRouter);
  app.use('/api/validate-image', requireApiKey, validateImageRouter);
  app.use('/api/parse-query', requireApiKey, parseQueryRouter);
  app.use('/api/route-task', requireApiKey, routeTaskRouter);
  app.use('/api/execute-task', requireApiKey, executeTaskRouter);
  app.use('/api/model-audit', requireApiKey, modelAuditRouter);
  app.use('/api/catalog', requireApiKey, catalogRouter);
  app.use('/api/analyze', requireApiKey, analyzeRouter);

  // Unknown /api/* paths -> JSON 404 (never Express HTML). Must precede the
  // error handler so body-parser errors still reach jsonErrorHandler.
  app.use('/api', apiNotFound);
  app.use(jsonErrorHandler);

  return app;
}
