# ADR-006: Feature Flag for Phased Rollout

## Status
Proposed

## Context

The migration from the current `PiAgentService` (which calls the Router LLM directly via `fetch()`) to the Pi Agent SDK involves replacing the entire chat streaming path:

| Aspect | Current (`PiAgentService`) | Future (SDK via adapter) |
|--------|---------------------------|--------------------------|
| LLM call | `fetch(Router :18881/v1/chat/completions)` | `session.prompt()` via SDK's `streamSimple()` |
| System prompt | Hardcoded in `PiAgentService.ts` | Built by SDK from model, tools, resource loader |
| Tools | None | `tools: []` (see ADR-001) |
| Session mgmt | Stateless | `SessionManager.inMemory()` (see ADR-002) |
| Streaming | Manual SSE from Router response | SDK events → adapter → SSE (see ADR-003) |
| Tenant isolation | None (tenantId ignored) | Per-tenant AgentSession (see ADR-004) |
| Error handling | 45s timeout, immediate error | Disabled auto-retry, ubek-level retry (see ADR-005) |

This is a **fundamental change** to the chat backend. Risks include:

1. **SDK compatibility**: The SDK (`@earendil-works/pi-coding-agent` v0.75.5) is primarily designed as a CLI tool. We are using it programmatically in a server context — an uncommon usage pattern. Edge cases in server environments may not be tested.

2. **Event ordering**: The adapter (ADR-003) depends on correct event ordering from the SDK. If the SDK emits events in an unexpected order (e.g., `agent_end` before all `text_delta` events are consumed), the SSE stream could be malformed.

3. **SDK dependency loading**: `createAgentSession()` discovers and loads extensions, skills, prompts, and theme files from the filesystem. In a server context, these could be missing or cause unexpected startup delays.

4. **Performance regression**: The SDK adds overhead compared to a direct `fetch()` call — session initialisation, event subscription, internal message persistence (even in in-memory mode). We don't know the perf characteristics in a server context yet.

5. **Router access**: The current code calls the Router directly. The SDK also calls the Router (via `streamSimple()`), but with different request formatting, headers, and auth resolution. We need to verify Router compatibility.

6. **Auth/Model resolution**: The SDK uses `AuthStorage` and `ModelRegistry` to resolve API keys from `~/.pi/agent/auth.json`. In the ubek server context, this file may not exist or may have different contents than what the Router expects.

### Constraints

- The chat endpoint (`POST /api/chat/stream`) is the core ubek feature — breaking it means the entire product is down
- We need the ability to **roll back instantly** if the SDK path causes issues in production
- The migration should be **incremental** — not a flag-day cutover
- The feature flag should be **simple** — an environment variable or config toggle, not a distributed feature flag system

## Options Considered

### Option A — Big bang cutover

Replace `PiAgentService` with the SDK adapter in a single PR. Deploy and hope it works. Rollback by reverting the deploy.

- **Pros:**
  - Simplest code — no branching, no feature flag
  - No dead code paths to maintain
  - No testing matrix (one code path)
- **Cons:**
  - **Highest risk** — if the SDK path has issues in production, chat is broken for all users
  - Rollback requires a full deploy — slow (minutes)
  - No A/B comparison capability
  - No way to test in production with real traffic before full rollout
  - **Rejected as too risky** for a core feature migration

### Option B — Feature flag with gradual shift

Add a feature flag that controls which code path the chat endpoint uses:
- `flag = "stub"` (default) → current `PiAgentService` code
- `flag = "sdk"` → new SDK adapter code

The flag can be controlled by:
1. Environment variable (`UBEK_CHAT_BACKEND=stub|sdk`)
2. Per-tenant override (e.g., JWT claim or DB config)
3. Gradual percentage rollout (e.g., 10% → 50% → 100%)

```typescript
// In chat.ts:
const backend = process.env.UBEK_CHAT_BACKEND || "stub";

router.post("/stream", validate(streamSchema), async (req, res) => {
  if (backend === "sdk") {
    return handleSdkStream(req, res);  // New adapter path
  }
  return handleStubStream(req, res);   // Current PiAgentService path
});
```

- **Pros:**
  - **Instant rollback** — change env var, restart, done
  - Can test in production with internal users before general rollout
  - Gradual rollout de-risks the migration
  - A/B comparison possible (compare latency, error rates between paths)
  - Per-tenant override enables targeted testing
- **Cons:**
  - Two code paths to maintain during migration period
  - Testing matrix doubles (stub + SDK paths)
  - Feature flag logic is additional code
  - Dead code when migration is complete

### Option C — Parallel deployment (separate route)

Deploy the SDK adapter as a new route (e.g., `POST /api/chat/stream-v2`) while keeping the existing route. Frontend controls which route to use via a client-side flag.

- **Pros:**
  - No backend branching — two completely separate routes
  - Frontend can A/B test easily
  - Clean separation of concerns
- **Cons:**
  - Requires frontend changes to select the route
  - Two endpoints to maintain, document, and monitor
  - Frontend-side flag means users could accidentally use the wrong endpoint
  - Route proliferation — "stream-v3" when the next change comes?
  - More complex testing (frontend + backend coordination)

## Decision

**Adopt Option B: Feature flag with environment variable control, defaulting to "stub".**

```typescript
// src/config.ts (or existing env config)
export const config = {
  chatBackend: (process.env.UBEK_CHAT_BACKEND || "stub") as "stub" | "sdk",
};

// src/routes/chat.ts
import { config } from "../config.js";

router.post("/stream", validate(streamSchema), async (req, res) => {
  if (config.chatBackend === "sdk") {
    return handleSdkStream(req, res);
  }
  return handleLegacyStream(req, res);
});
```

### Rollout plan

| Phase | Flag setting | Scope | Validation criteria |
|-------|-------------|-------|-------------------|
| **1. Dev testing** | `UBEK_CHAT_BACKEND=sdk` | Local dev | All existing chat scenarios work end-to-end |
| **2. Internal preview** | Per-tenant override | Internal test tenants | No regression vs stub path |
| **3. Canary (10%)** | `sdk` for 10% of tenants | Production subset | Error rate ≤ stub, latency ≤ stub + 200ms |
| **4. Canary (50%)** | `sdk` for 50% | Broader set | Same, plus no support tickets related to chat |
| **5. Full rollout** | `sdk` for 100% | All tenants | Monitor for 1 week |
| **6. Cleanup** | Remove flag, delete stub | All | Remove dead code |

### Rollback criteria

Revert to `stub` immediately if:
- Error rate increases by ≥1% for the SDK path vs the stub path
- P50 latency increases by ≥500ms
- Any tenant reports missing messages or garbled responses
- SDK throws unhandled exceptions in production

### What the feature flag does NOT control

- The feature flag only controls the chat streaming path (`POST /api/chat/stream`)
- `GET /api/chat/sessions` is unaffected (it queries Postgres independently)
- Vision endpoint is unaffected (separate migration in the future)
- Auth, guardrails, rate limiting are applied before the flag is checked

### When to remove the flag

Delete the stub code and remove the feature flag **one week** after phase 5 (100% rollout) with no rollbacks. This is captured as a cleanup task in the implementation plan.

## Consequences

### Easier
- **Risk mitigation**: Instant rollback via environment variable. No deploy needed.
- **Incremental confidence**: Each phase validates the SDK path under increasing load.
- **Testing flexibility**: Can compare stub vs SDK behaviour side-by-side.
- **No frontend coupling**: The frontend doesn't need to know which backend is active.

### Harder
- **Two code paths**: Stub and SDK paths must both be maintained during the migration.
- **Testing burden**: Both paths must pass the same test suite.
- **Feature flag debt**: The flag is temporary but must be cleaned up (or it becomes permanent config spaghetti).
- **Missed coverage**: Some edge cases may only manifest in the SDK path and be missed if testing focuses on the stub path.

### Trade-off
Safety over simplicity. The feature flag adds code complexity but provides a safety net that a big-bang cutover cannot. The temporary cost of maintaining two paths is justified by the ability to roll back in seconds, not deploys.

The flag will be removed within 2 weeks of reaching 100% rollout — we treat it as a temporary migration tool, not permanent infrastructure.