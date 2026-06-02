# ADR-004: Per-Tenant AgentSession Isolation

## Status
Proposed

## Context

The ubek server is **multi-tenant** — the `authMiddleware` extracts a `tenantId` from the JWT, and all database queries are scoped by `tenant_id`. The current `PiAgentService.stream()` accepts `tenantId` but does not use it:

```typescript
// Current code — tenantId is accepted but ignored
async stream(
  _tenantId: string,  // Underscore prefix = unused
  messages: Array<{ role: string; content: string }>,
  callbacks: StreamCallbacks,
): Promise<void> { ... }
```

The Pi Agent SDK has **no concept of tenancy**. A single `AgentSession` instance has:

- One `SessionManager` (one conversation tree)
- One `Model` (the LLM being used)
- One `cwd` (working directory, irrelevant in server context)
- One set of tools

The SDK's default `ResourceLoader` (`DefaultResourceLoader`) discovers project files from the filesystem based on `cwd`:

```typescript
// SDK source: DefaultResourceLoader loads skills, prompts, context files from cwd
const loader = new DefaultResourceLoader({ cwd, agentDir, settingsManager });
await loader.reload();
```

In a server context, `cwd` is meaningless. But more critically:

1. **Conversation isolation**: Tenant A's conversation must not leak into Tenant B's session context. A shared `AgentSession` would interleave messages.

2. **Model/configuration isolation**: Each tenant might have different model assignments, system prompts, or tool access levels.

3. **Resource isolation**: If a `ResourceLoader` discovers files based on `cwd`, two tenants sharing a session would see the same "project context" — potentially leaking configuration.

4. **Session lifecycle**: When Tenant A disconnects, we must not terminate Tenant B's active session.

### Constraints

- `createAgentSession()` is **not cheap** — it initialises AuthStorage, ModelRegistry, ResourceLoader, discovers extensions, and builds the initial system prompt
- But it's **not prohibitively expensive** either — the SDK is designed to be called per-session (it's what the CLI does on every startup)
- The overall architecture (ADR-003) already dictates an adapter layer — per-tenant session management can live there
- Sessions are in-memory (ADR-002) — there's no cross-tenant contamination risk from shared files

## Options Considered

### Option A — Per-tenant AgentSession (one session per tenant)

Each tenant request creates a dedicated `AgentSession` instance. Sessions are cached by `tenantId` in a `Map<string, AgentSession>` and reused for subsequent messages in the same conversation.

```typescript
class AgentSessionPool {
  private sessions = new Map<string, AgentSession>();

  async getOrCreate(tenantId: string, model: Model): Promise<AgentSession> {
    let session = this.sessions.get(tenantId);
    if (!session) {
      session = await this.createSession(tenantId, model);
      this.sessions.set(tenantId, session);
    }
    return session;
  }

  private async createSession(tenantId: string, model: Model): Promise<AgentSession> {
    const sessionManager = SessionManager.inMemory();
    const { session } = await createAgentSession({
      sessionManager,
      tools: [],
      model,
      // Each tenant gets its own in-memory conversation tree
    });
    return session;
  }
}
```

- **Pros:**
  - Full tenant isolation — no conversation or state leakage
  - Each tenant can have independent model configuration
  - Session lifecycle is scoped to tenant activity
  - Simple to implement and reason about
- **Cons:**
  - More memory — each tenant holds its own conversation tree in memory
  - Session creation overhead per tenant — first request is slower
  - Need session eviction policy to prevent unbounded memory growth

### Option B — Shared AgentSession (single session, all tenants)

All tenants share one `AgentSession`. Messages from all tenants are interleaved in one conversation tree.

- **Pros:**
  - Lowest resource usage — one session, one conversation tree
  - Fast — no session creation overhead per tenant
  - Simplest initial implementation
- **Cons:**
  - **Catastrophic isolation failure** — Tenant A sees Tenant B's conversation history in the LLM context
  - Context window pollution — every tenant's messages consume context for all others
  - Impossible to identify which message belongs to which tenant
  - Fundamentally broken for any multi-tenant use case
  - This option is rejected as non-viable.

### Option C — Session pool with TTL eviction

Like Option A (per-tenant), but with a pool that limits the number of concurrent sessions and evicts idle sessions after a TTL.

- **Pros:**
  - All benefits of Option A plus bounded memory usage
  - Idle session cleanup prevents resource exhaustion
  - Can be tuned per deployment (max sessions, TTL)
- **Cons:**
  - More complex — requires eviction logic, activity tracking, cleanup
  - Premature optimisation — we don't know session concurrency patterns yet
  - Can be added later as an evolution of Option A without breaking changes

## Decision

**Adopt Option A: Per-tenant AgentSession, cached by tenantId.**

```typescript
// In the adapter (see ADR-003):
class TenantSessionManager {
  private sessions = new Map<string, { session: AgentSession; lastUsed: number }>();

  async getOrCreate(tenantId: string, model: Model): Promise<AgentSession> {
    const existing = this.sessions.get(tenantId);
    if (existing) {
      existing.lastUsed = Date.now();
      return existing.session;
    }
    const sessionManager = SessionManager.inMemory();
    const { session } = await createAgentSession({
      sessionManager,
      tools: [],
      model,
      // Use a tenant-scoped agentDir to avoid cross-tenant auth/model file sharing
      agentDir: `/tmp/ubek/agents/${tenantId}`,
    });
    this.sessions.set(tenantId, { session, lastUsed: Date.now() });
    return session;
  }
}
```

### Per-tenant `agentDir`

We also set a **tenant-scoped `agentDir`** (`/tmp/ubek/agents/{tenantId}/`). This ensures:

- The SDK's `AuthStorage` and `ModelRegistry` resolve per-tenant auth and model configuration
- No cross-tenant file sharing from SDK default paths
- Clean separation — each tenant's auth.json, models.json, and any future SDK files are isolated

**Important**: The `agentDir` path uses `/tmp/` (not a persistent volume) because sessions are in-memory (ADR-002). On server restart, the directory is recreated. This avoids accumulation of tenant directories.

### Session eviction (future)

We will add TTL-based eviction when:
- We observe memory pressure from idle sessions
- The number of concurrent tenants grows beyond a reasonable threshold
- We have usage data to inform TTL values

Until then, sessions live for the duration of the server process. With in-memory sessions (ADR-002) and no default tools (ADR-001), the per-session memory footprint is small (mainly the conversation message tree).

## Consequences

### Easier
- **Full isolation**: Tenants cannot see each other's conversations. No context leakage.
- **Independent configuration**: Each tenant can have its own model, system prompt, and future tool access.
- **Clean lifecycle**: Sessions are created on first activity, cleaned up on server restart.
- **Testable**: Per-tenant session creation can be tested in isolation.

### Harder
- **Memory usage**: N tenants = N conversation trees in memory. Mitigated by in-memory sessions being relatively cheap (no loaded extensions, no tool definitions).
- **First-request latency**: The first request per tenant incurs `createAgentSession()` overhead (~50-200ms depending on filesystem and model registry setup). Subsequent requests reuse the session.
- **No cross-tenant features**: Cannot implement features like "share conversation with another tenant" without explicitly building them.

### Trade-off
Isolation over resource efficiency. We pay a memory cost per tenant to guarantee that no conversation state crosses tenant boundaries. The cost is acceptable because:
1. Sessions are lightweight (text-only, no tools, no extensions)
2. In-memory sessions have no disk I/O
3. Session creation is a one-time cost per tenant
4. Future TTL eviction will bound the memory usage