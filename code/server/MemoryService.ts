/**
 * MemoryService — Backend integration with the external Memory API (v2).
 *
 * Calls the running Memory API (MEMORY_API_URL) to extract and persist
 * long-term facts from chat, and to retrieve relevant facts for context.
 *
 * Auth: uses x-api-token header when MEMORY_API_TOKEN is set.
 * Uses native fetch (consistent with PiAgentService, RAGService, llm.ts etc).
 */

export interface MemoryContext {
  agentId?: string;
  tenantId?: string;
  userId?: string;
  signal?: AbortSignal; // for cancellation (Issue 7)
}

// Minimal response shapes for the real Memory API contract (improves on any)
export interface ExtractFactsResponse {
  extracted?: number;
  saved?: number;
  facts?: Array<{ content: string; category?: string; importance?: number }>;
  [k: string]: unknown;
}

export interface MemorySearchResponse {
  results?: Array<{ id?: string; content?: string; excerpt?: string; [k: string]: unknown }>;
  memories?: any[];
  [k: string]: unknown;
}

export class MemoryService {
  private readonly baseUrl: string;
  private readonly token: string;

  constructor() {
    this.baseUrl = (process.env.MEMORY_API_URL || "http://localhost:8766").replace(/\/$/, "");
    this.token = process.env.MEMORY_API_TOKEN || "";
  }

  private getHeaders(extra: Record<string, string> = {}): Record<string, string> {
    const h: Record<string, string> = { "Content-Type": "application/json", ...extra };
    if (this.token) {
      h["x-api-token"] = this.token;
    }
    return h;
  }

  /**
   * Extract facts from text (user utterance or turn) and save them.
   * Uses the /extract-facts endpoint (exists on running Memory API).
   */
  async extractAndStore(text: string, ctx: MemoryContext = {}): Promise<ExtractFactsResponse> {
    if (!text || text.trim().length < 3) return { skipped: true };

    const agentId = ctx.agentId || ctx.tenantId || "ubek-chat";
    const body = {
      text: text.slice(0, 8000),
      agent_id: agentId,
      project_id: ctx.tenantId || "",
      auto_save: true,
    };

    try {
      const res = await fetch(`${this.baseUrl}/extract-facts`, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify(body),
        signal: ctx.signal,
      });
      if (!res.ok) {
        console.warn("[MemoryService] extract-facts failed:", res.status);
        return { error: res.status };
      }
      return await res.json().catch(() => ({})) as ExtractFactsResponse;
    } catch (e: any) {
      if (e.name === 'AbortError') return { error: 'aborted' };
      console.warn("[MemoryService] extract error (non-fatal):", e?.message || e);
      return { error: "network" };
    }
  }

  /**
   * Search for relevant facts. Returns compact list of contents for prompt injection.
   * Uses POST /search (hybrid search on running Memory API).
   */
  async searchRelevant(query: string, ctx: MemoryContext = {}, limit = 5): Promise<string[]> {
    if (!query || query.trim().length < 2) return [];

    const agentId = ctx.agentId || ctx.tenantId || "ubek-chat";
    const body = {
      query: query.slice(0, 500),
      agent_id: agentId,
      limit,
      cross_agent: true,
      compact: true,
    };

    try {
      const res = await fetch(`${this.baseUrl}/search`, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify(body),
        signal: ctx.signal,
      });
      if (!res.ok) return [];
      const data = await res.json().catch(() => ({})) as MemorySearchResponse;
      const results = (data.results || data.memories || []) as any[];
      return results
        .map((r: any) => (typeof r === "string" ? r : r.content || r.excerpt || ""))
        .filter(Boolean)
        .slice(0, limit);
    } catch (e: any) {
      if (e.name === 'AbortError') return [];
      console.warn("[MemoryService] search error (non-fatal):", e?.message || e);
      return [];
    }
  }
}

// Singleton for convenience in routes
export const memoryService = new MemoryService();