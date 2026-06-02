/**
 * UbekV2 Server — Backend API for Pi per-client platform
 *
 * Endpoints:
 *   Chat:      POST /api/chat/stream    (SSE)
 *              POST /api/chat            (JSON)
 *              GET  /api/chat/sessions
 *              POST /api/chat/sessions
 *   Agents:    GET  /api/agents
 *              POST /api/agents/create
 *   Vault:     GET  /api/vault/stats
 *              GET  /api/vault/folders
 *              POST /api/vault/upload
 *              GET  /api/vault/file/:id/preview
 *   Tenant:    GET  /api/tenant/:slug
 *              POST /api/tenant/:slug/onboard
 *   Health:    GET  /api/health
 *   Social:    POST /api/social-media/generate
 *   Dashboard: GET  /api/tenant/dashboard-settings
 *              POST /api/tenant/dashboard-settings
 *
 * All endpoints accept x-tenant-id header.
 */

import express from "express";
import helmet from "helmet";
import * as Sentry from "@sentry/node";
import cors from "cors";
import { config } from "dotenv";

import chatRouter from "./routes/chat.js";
import { agentsRouter } from "./routes/agents.js";
import { vaultRouter } from "./routes/vault.js";
import { adminRouter } from "./routes/admin.js";
import { healthRouter } from "./routes/health.js";
import provisioningRouter from "./routes/provisioning.js";
import extendedCoreRouter from "./routes/extended-core.js";
import { tenantRouter } from "./routes/tenant.js";
import dashboardRouter from "./routes/dashboard.js";
import { authRouter } from "./routes/auth.js";
import { channelsRouter } from "./routes/channels.js";
import tradingRouter from "./routes/trading.js";
import visionRouter from "./routes/vision.js";
import ragRouter from "./routes/rag.js";
import documentsRouter from "./routes/documents.js";

import { chatGuardMiddleware } from "./guardrails/chatGuard.js";
import { initAuditSchema } from "./guardrails/AuditLogger.js";
import { initStore } from "./data/store.pg.js";
import { initChannels } from "./channels/boot.js";

config();

const app = express();
const PORT = parseInt(process.env.PORT || "4000", 10);
const CORS_ORIGIN = (process.env.CORS_ORIGIN || "http://localhost:3000").split(",");

// ── CORS: allow all localhost ports + configured origins ────────────────────

const corsOrigin = (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
  const isDev = process.env.ENV !== "production";

  // Extremely permissive for local development (frontend often on 3003)
  if (isDev) {
    if (!origin) {
      console.log("[CORS] Dev: allowing request with no origin");
      callback(null, true);
      return;
    }

    // Allow any localhost / 127.0.0.1 on any port during dev
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      console.log(`[CORS] Dev: allowing origin ${origin}`);
      callback(null, true);
      return;
    }
  }

  // Production / fallback strict mode
  if (!origin) {
    callback(null, false);
    return;
  }

  if (origin === "http://localhost:3003" || origin === "http://127.0.0.1:3003") {
    callback(null, true);
    return;
  }

  if (/^https?:\/\/(localhost|127\.0\.0\.1):(3000|3001|3002|3003|4000|5173)$/.test(origin)) {
    callback(null, true);
    return;
  }

  if (CORS_ORIGIN.includes(origin)) {
    callback(null, true);
    return;
  }

  console.warn(`[CORS] Rejected origin: ${origin}`);
  callback(null, false);
};

// ── Middleware ──────────────────────────────────────────────────────────────



app.use(cors({
  origin: corsOrigin,
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-tenant-id", "x-api-token"],
  exposedHeaders: ["Content-Type"], // useful for SSE clients
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// JSON body parse errors — return 400 instead of 500
app.use((err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err instanceof SyntaxError && err.message.includes('JSON')) {
    return res.status(400).json({ error: 'Invalid JSON body', details: err.message });
  }
  next(err);
});

// ── Security headers (Helmet) ─────────────────────────────────────────────
// Build CSP connect-src — in dev allow any localhost port (fixes CSP blocking fetch to :4000 from :3003)
const isDev = process.env.ENV !== "production";
const cspConnectSrc = [
  "'self'",
  "http://localhost:18881",
  "http://127.0.0.1:18881",
  "https://openrouter.ai/v1",
  "https://inference-api.nousresearch.com/v1",
  "https://opencode.ai/v1",
  ...(isDev
    ? ["http://localhost:*", "http://127.0.0.1:*"]
    : (process.env.CORS_ORIGIN || "http://localhost:3000")
        .split(",")
        .map(s => s.trim())
        .filter(s => s.length > 0)
  ),
];

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      connectSrc: cspConnectSrc,
      imgSrc: ["'self'", "data:", "https:"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      frameAncestors: ["'none'"],
      formAction: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false, // needed for SSE streaming
  frameguard: { action: 'deny' },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));

// Request logging
app.use((req, _res, next) => {
  const tenant = req.headers["x-tenant-id"] || "—";
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} [tenant: ${tenant}]`);
  next();
});

// ── Routes ──────────────────────────────────────────────────────────────────

app.use("/api/chat", chatGuardMiddleware);  // guard FIRST: rate limit + injection
app.use("/api/chat", chatRouter);
app.use("/api/chat", visionRouter);
app.use("/api/agents", agentsRouter);
app.use("/api/vault", vaultRouter);
app.use("/api/admin", adminRouter);
app.use("/api/health", healthRouter);

// ── Dashboard (Server-Driven UI) — MUST be BEFORE tenant/:slug ──
app.use("/api/tenant", dashboardRouter);
app.use("/api/tenant", tenantRouter);
app.use("/api/auth", authRouter);
app.use("/api/channels", channelsRouter);
app.use("/api", provisioningRouter);
app.use("/api", extendedCoreRouter);
app.use("/api", ragRouter);
app.use("/api", documentsRouter);
app.use("/api/trading", tradingRouter);

// ── Sentry error handler (before 404 handler) ──────────────────────────────
// Cast needed due to Express v4/v5 type mismatch with @sentry/node v10
app.use(Sentry.expressErrorHandler() as unknown as express.ErrorRequestHandler);

// ── 404 handler ────────────────────────────────────────────────────────────

app.use((_req, res) => {
  res.status(404).json({ error: "Not found", hint: "Check /api/health for available endpoints" });
});

// ── Error handler ───────────────────────────────────────────────────────────

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[server] Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

// ── Start ───────────────────────────────────────────────────────────────────

async function start() {
  await initStore();
  await initAuditSchema();

  // Memory API integration active (MemoryService + chat routes)

  // Init channels (WebSocket, WhatsApp, Telegram, etc.)
  // Graceful boot: timeout 10s, never blocks server start
  await initChannels(10_000).catch((err) => {
    console.warn('[server] Channels init non-fatal:', err.message);
  });

  const server = app.listen(PORT, () => {
    console.log(`\n[ubek-server] Running on http://localhost:${PORT}`);
    console.log(`[ubek-server] CORS: permissive for all localhost:* in dev (incl. :3003) + ${CORS_ORIGIN.join(", ")}`);
    console.log(`[ubek-server] x-tenant-id header supported on all endpoints`);
    console.log(`[ubek-server] Health: http://localhost:${PORT}/api/health\n`);
  });

server.on('error', (err: any) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[ubek-server] Port ${PORT} already in use — assuming existing instance is running`);
    console.error(`[ubek-server] To restart: fuser -k ${PORT}/tcp && npm run dev`);
    process.exit(0);
  } else {
    console.error('[ubek-server] Server error:', err);
    process.exit(1);
  }
});
}

start().catch((err) => {
  console.error("[ubek-server] Failed to start:", err);
  process.exit(1);
});

export default app;