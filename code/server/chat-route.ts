import { Router, type Request, type Response } from "express";
import { authMiddleware } from "./auth.js";
import { PiAgentService } from "../services/PiAgentService.js";
import { validate, streamSchema } from "../guardrails/validation.js";
import { memoryService } from "../services/MemoryService.js";

import { pool } from "../data/db.js";

const router = Router();
router.use(authMiddleware);

function sendSSEStatus(res: Response, status: string) {
  res.write(`data: ${JSON.stringify({ type: "status", status })}\n\n`);
}
function sendSSEText(res: Response, text: string) {
  res.write(`data: ${JSON.stringify({ type: "text", content: text })}\n\n`);
}
function sendSSEDone(res: Response, sessionId: string) {
  res.write(`data: ${JSON.stringify({ type: "done", sessionId })}\n\n`);
  res.end();
}

// Centralized tenant derivation (addresses repeated (req as any).user?.tenantId pattern)
function getTenantId(req: Request): string {
  return (req as any).user?.tenantId || "default";
}

router.post("/stream", validate(streamSchema), async (req: Request, res: Response) => {
  const { messages, message } = req.body;
  // Normalize: accept both `message` (string) and `messages` (array)
  let normalizedMessages = messages || [{ role: 'user', content: message }];
  const tenantId = getTenantId(req);

  // Send headers + early status *immediately* so client sees progress (fixes blocking before writeHead)
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  sendSSEStatus(res, "🧠 Recalling relevant memory...");

  // Short-lived AbortController so memory fetches can be actively cancelled (leverages new signal support in MemoryService)
  const memAbort = new AbortController();
  res.on('close', () => memAbort.abort()); // best-effort cancel on client disconnect / response end

  // Small local helper (avoids full copy+reverse allocation; aligns pre/post logic)
  function getLastUserContent(msgs: any[], fallback: any): string {
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i]?.role === 'user') return msgs[i].content || '';
    }
    return (fallback || '').toString();
  }

  // TC-3.1: retrieve relevant long-term memories and inject as context (best-effort, capped)
  try {
    const lastUser = getLastUserContent(normalizedMessages, message);
    // Cap memory lookup so it never delays LLM path > ~1.5s (race + timeout)
    const factsPromise = memoryService.searchRelevant(lastUser, { tenantId, signal: memAbort.signal }, 4);
    const timeoutPromise = new Promise<string[]>((resolve) => setTimeout(() => resolve([]), 1400));
    const facts = await Promise.race([factsPromise, timeoutPromise]);
    if (facts.length > 0) {
      const memBlock = "FACTS FROM LONG-TERM MEMORY (use when relevant, do not mention this note):\n- " + facts.join("\n- ");
      normalizedMessages = [{ role: 'system', content: memBlock }, ...normalizedMessages];
    }
    // Do not send empty status here — let the very next real onStatus from PiAgent overwrite the recalling banner (avoids transient blank flash)
  } catch { /* non-fatal */ }
  try {
    const piAgent = new PiAgentService();
    await piAgent.stream(tenantId, normalizedMessages, {
      onToken(token: string) { sendSSEText(res, token); },
      onStatus(status: string) { sendSSEStatus(res, status); },
      onDone() {
        sendSSEDone(res, "new");
        // TC-3.1: trigger extraction tied to successful response emission (not after outer await)
        // Use same finder as pre-retrieve for consistency
        const lastUserMsg = getLastUserContent(normalizedMessages, message);
        if (lastUserMsg) {
          setImmediate(() => {
            memoryService.extractAndStore(lastUserMsg, { tenantId, signal: memAbort.signal }).catch(() => {});
          });
        }
      },
      onError(error: Error) { sendSSEStatus(res, "Error: " + error.message); res.end(); },
    });
  } catch (err: any) {
    sendSSEStatus(res, "Error: " + err.message);
    res.end();
  }
});

router.get("/sessions", async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const tenantId = user?.tenantId;
    const agentId = req.query.agentId as string || 'AW-0001';
    
    const result = await pool.query(
      `SELECT id, title, updated_at as "updatedAt", messages
       FROM sessions
       WHERE tenant_id = $1 AND agent_id = $2
       ORDER BY updated_at DESC
       LIMIT 50`,
      [tenantId, agentId]
    );
    
    const sessions = (result.rows || []).map((row: any) => ({
      id: row.id,
      title: row.title,
      messageCount: row.messages?.length || 0,
      updatedAt: row.updatedAt,
      lastMessage: row.messages?.[row.messages.length - 1]?.content?.slice(0, 100) || '',
    }));
    
    res.json({ ok: true, sessions });
  } catch (error) {
    console.error("[chat/sessions] Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/chat/sessions — create or update a session
router.post("/sessions", async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const tenantId = user?.tenantId;
    const agentId = req.query.agentId as string || 'AW-0001';
    const { id, title, messages } = req.body;
    
    if (!id || !title) {
      res.status(400).json({ error: "Missing required fields: id, title" });
      return;
    }
    
    // Upsert: insert or update
    await pool.query(
      `INSERT INTO sessions (id, agent_id, tenant_id, title, messages, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (id) DO UPDATE SET
         title = EXCLUDED.title,
         messages = EXCLUDED.messages,
         updated_at = NOW()`,
      [id, agentId, tenantId, title, JSON.stringify(messages || [])]
    );
    
    res.json({ ok: true, id });
  } catch (error) {
    console.error("[chat/sessions POST] Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/chat/sessions/:id
router.delete("/sessions/:id", async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const tenantId = user?.tenantId;
    const { id } = req.params;
    
    await pool.query(
      `DELETE FROM sessions WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );
    
    res.json({ ok: true });
  } catch (error) {
    console.error("[chat/sessions DELETE] Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/chat/sessions/:id — fetch full session with messages (for reliable reload)
router.get("/sessions/:id", async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const tenantId = user?.tenantId;
    const { id } = req.params;
    
    const result = await pool.query(
      `SELECT id, title, messages, updated_at as "updatedAt"
       FROM sessions
       WHERE id = $1 AND tenant_id = $2
       LIMIT 1`,
      [id, tenantId]
    );
    
    if (result.rows.length === 0) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    
    const row = result.rows[0];
    res.json({
      ok: true,
      session: {
        id: row.id,
        title: row.title,
        messages: row.messages || [],
        updatedAt: row.updatedAt,
      },
    });
  } catch (error) {
    console.error("[chat/sessions/:id GET] Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;