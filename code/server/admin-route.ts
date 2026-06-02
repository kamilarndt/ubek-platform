/**
 * Admin API Routes — dla Admin Dashboard Kamila
 *
 * Endpoints:
 *   GET    /api/admin/overview         — statystyki główne
 *   GET    /api/admin/clients           — lista klientów
 *   GET    /api/admin/clients/:slug     — szczegóły klienta
 *   GET    /api/admin/blocks            — lista bloków
 *   PUT    /api/admin/blocks/:id/approve — zatwierdź blok
 *   PUT    /api/admin/blocks/:id/reject  — odrzuć blok
 *   GET    /api/admin/usage             — statystyki użycia
 *   GET    /api/admin/billing           — subskrypcje
 *   GET    /api/admin/settings          — ustawienia
 *   PUT    /api/admin/settings/:key     — aktualizuj ustawienie
 *   GET    /api/admin/logs              — logi systemowe
 *   GET    /api/admin/events            — eventy
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import * as adminStore from "../data/admin-store.js";
import { authMiddleware } from "../middleware/auth.js";

export const adminRouter = Router();

/**
 * Admin auth guard — requires valid JWT + admin role.
 * Applied to ALL /api/admin/* routes.
 */
adminRouter.use(authMiddleware);
adminRouter.use((req: Request, res: Response, next: NextFunction) => {
  const user = req.user;
  // Debug logging
  console.log("[admin] User:", { role: user?.role, email: user?.email });
  if (!user || user.role !== "owner") {
    res.status(403).json({ error: "Forbidden — admin access required" });
    return;
  }
  next();
});

/** Helper: extract tenant/slug from params or header */
function getTenantId(req: Request): string {
  return (req.params.slug as string) || (req.headers["x-tenant-id"] as string) || "rafal-shark";
}

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/admin/overview
// ═══════════════════════════════════════════════════════════════════════════

adminRouter.get("/overview", async (_req: Request, res: Response) => {
  try {
    const stats = await adminStore.getOverviewStats();
    const recentEvents = await adminStore.getRecentEvents(10);

    res.json({
      ok: true,
      stats,
      recentEvents,
    });
  } catch (error) {
    console.error("[admin/overview] Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/admin/clients
// ═══════════════════════════════════════════════════════════════════════════

adminRouter.get("/clients", async (_req: Request, res: Response) => {
  try {
    const clients = await adminStore.getAllClients();
    res.json({ ok: true, clients });
  } catch (error) {
    console.error("[admin/clients] Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/admin/clients/:slug
// ═══════════════════════════════════════════════════════════════════════════

adminRouter.get("/clients/:slug", async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const allClients = await adminStore.getAllClients();
    const client = allClients.find((c) => c.slug === slug);

    if (!client) {
      res.status(404).json({ error: "Client not found" });
      return;
    }

    const usage = await adminStore.getClientUsage(slug, 14);

    res.json({ ok: true, client, usage });
  } catch (error) {
    console.error("[admin/clients/:slug] Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/admin/blocks
// ═══════════════════════════════════════════════════════════════════════════

adminRouter.get("/blocks", async (req: Request, res: Response) => {
  try {
    const status = req.query.status as string | undefined;
    const tenantId = req.query.tenantId as string | undefined;

    const blocks = await adminStore.getAdminBlocks({ status, tenantId })

... [OUTPUT TRUNCATED - 672 chars omitted out of 10672 total] ...

as string) || "admin";
    const block = await adminStore.approveBlock(id, reviewer);

    if (!block) {
      res.status(404).json({ error: "Block not found or already reviewed" });
      return;
    }

    res.json({ ok: true, block });
  } catch (error) {
    console.error("[admin/blocks/approve] Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// PUT /api/admin/blocks/:id/reject
// ═══════════════════════════════════════════════════════════════════════════

adminRouter.put("/blocks/:id/reject", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid block ID" });
      return;
    }

    const reviewer = (req.body?.reviewer as string) || "admin";
    const reason = (req.body?.reason as string) || "No reason provided";

    const block = await adminStore.rejectBlock(id, reviewer, reason);

    if (!block) {
      res.status(404).json({ error: "Block not found or already reviewed" });
      return;
    }

    res.json({ ok: true, block });
  } catch (error) {
    console.error("[admin/blocks/reject] Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/admin/usage
// ═══════════════════════════════════════════════════════════════════════════

adminRouter.get("/usage", async (req: Request, res: Response) => {
  try {
    const days = parseInt((req.query.days as string) || "30", 10);
    const usage = await adminStore.getUsageOverview(days);
    res.json({ ok: true, ...usage });
  } catch (error) {
    console.error("[admin/usage] Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/admin/billing
// ═══════════════════════════════════════════════════════════════════════════

adminRouter.get("/billing", async (_req: Request, res: Response) => {
  try {
    const billing = await adminStore.getBillingOverview();
    const { subscriptions } = billing;

    // Calculate MRR
    const mrr = subscriptions.reduce((sum, s) => sum + s.amount, 0);
    const activeSubs = subscriptions.filter((s) => s.status === "active").length;
    const trialsEnding = subscriptions.filter((s) => {
      if (!s.trialEnd) return false;
      const daysLeft = Math.ceil(
        (new Date(s.trialEnd).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );
      return daysLeft > 0 && daysLeft <= 7;
    }).length;

    res.json({
      ok: true,
      mrr,
      activeSubs,
      trialsEnding,
      subscriptions,
    });
  } catch (error) {
    console.error("[admin/billing] Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/admin/settings
// ═══════════════════════════════════════════════════════════════════════════

adminRouter.get("/settings", async (_req: Request, res: Response) => {
  try {
    const settings = await adminStore.getAdminSettings();

    // Convert flat array to structured object
    const formatted: Record<string, unknown> = {};
    for (const s of settings) {
      formatted[s.key] = s.value;
    }

    res.json({ ok: true, settings: formatted });
  } catch (error) {
    console.error("[admin/settings] Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// PUT /api/admin/settings/:key
// ═══════════════════════════════════════════════════════════════════════════

adminRouter.put("/settings/:key", async (req: Request, res: Response) => {
  try {
    const { key } = req.params;
    const { value, updatedBy } = req.body;

    if (!value) {
      res.status(400).json({ error: "value is required" });
      return;
    }

    const setting = await adminStore.updateAdminSetting(key, value, updatedBy || "admin");
    if (!setting) {
      res.status(404).json({ error: `Setting '${key}' not found` });
      return;
    }

    res.json({ ok: true, setting });
  } catch (error) {
    console.error("[admin/settings/:key] Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/admin/logs
// ═══════════════════════════════════════════════════════════════════════════

adminRouter.get("/logs", async (req: Request, res: Response) => {
  try {
    const {
      level,
      client,
      eventType,
      fromDate,
      toDate,
      limit: limitStr,
      offset: offsetStr,
    } = req.query as Record<string, string>;

    const limit = limitStr ? parseInt(limitStr, 10) : 50;
    const offset = offsetStr ? parseInt(offsetStr, 10) : 0;

    const result = await adminStore.getRecentLogs({
      level,
      client,
      eventType,
      fromDate,
      toDate,
      limit,
      offset,
    });

    res.json({ ok: true, logs: result.rows, total: result.total, limit, offset });
  } catch (error) {
    console.error("[admin/logs] Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/admin/events
// ═══════════════════════════════════════════════════════════════════════════

adminRouter.get("/events", async (req: Request, res: Response) => {
  try {
    const limit = parseInt((req.query.limit as string) || "20", 10);
    const events = await adminStore.getRecentEvents(limit);
    res.json({ ok: true, events, count: events.length });
  } catch (error) {
    console.error("[admin/events] Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});