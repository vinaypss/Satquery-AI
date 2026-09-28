import 'dotenv/config';
import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { createServerApp } from './backend/server/index.js';
import { getProductionReadinessWarnings } from './backend/server/security/secureDefaults.js';

async function startServer() {
  const app = createServerApp();
  const PORT = Number.parseInt(process.env.PORT || '3000', 10);

  // Warn-only production readiness check (never throws; dev unaffected).
  for (const warning of getProductionReadinessWarnings()) {
    console.warn(`[SatQuery AI] SECURITY WARNING: ${warning}`);
  }

  // Vite middleware in development vs static file serving in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[SatQuery AI] Server running on http://0.0.0.0:${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
  });
}

startServer().catch((err) => {
  console.error('[SatQuery AI] Failed to start server:', err);
  process.exit(1);
});
