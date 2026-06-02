# ADR-002: In-Memory Sessions Only (No Persistence Initially)

## Status
**WITHDRAWN** (2026-06-02) — replaced by ADR-012: Full Session Persistence

## Context

The Pi Agent SDK's default `SessionManager` (`SessionManager.create()`) persists all conversation history to **plain JSONL files** on disk. By default, these are written to:

```
~/.pi/agent/sessions/<encoded-cwd>/<timestamp>_<sessionId>.jsonl
```

Each file is an append-only log of session entries — user messages, assistant responses, tool calls, compaction summaries — stored as newline-delimited JSON. The SDK type definitions confirm:

```typescript
// Default: persist=true, writes to ~/.pi/agent/sessions/<cwd-hash>/
SessionManager.create(cwd, sessionDir)  // persist = true
SessionManager.inMemory(cwd)            // persist = false
```

The current ubek chat in `PiAgentService.ts` has **no session persistence** — it calls the Router via `fetch()` in a stateless manner. Each request is standalone. The frontend maintains its own message list in the browser. The server does not store conversation history.

### Problems with default persistence in a server context

1. **Security**: JSONL files contain full conversation history in plain text. In a multi-tenant server, these could leak between tenants if file paths are predictable.

2. **Storage lifecycle**: Who cleans up old sessions? How long do we keep them? Default SDK persistence has no TTL, no rotation, no limit.

3. **Infrastructure coupling**: File-based persistence assumes a single server with a writable filesystem. This breaks in containerised deployments (K8s, serverless) where the filesystem is ephemeral or read-only.

4. **Unknown requirements**: The product has not specified:
   - Whether sessions should persist across server restarts
   - Whether users expect to resume conversations
   - Whether session history is needed for audit/retrieval
   - Storage retention policy
   - Whether sessions should be stored in the existing PostgreSQL database (already used for sessions metadata in `chat.ts`)

5. **CWD encoding issue**: The SDK encodes the working directory into the session path. In a server context, the "cwd" concept is meaningless — there is no user-facing working directory.

### Constraints

- ubek already has a `sessions` PostgreSQL table queried by `GET /chat/sessions` for session listing
- This table stores only metadata (id, title, messageCount, updatedAt) — not message content
- Full conversation history is currently stored **only on the frontend**
- A `SessionManager` is **required** by `createAgentSession()` — it's not optional
- SDK offers `SessionManager.inMemory()` as a first-class alternative

## Options Considered

### Option A — In-memory sessions (SessionManager.inMemory())

Use `SessionManager.inMemory()` — no file writes, no persistence. Sessions exist only as long as the AgentSession object lives.

```typescript
const sessionManager = SessionManager.inMemory();
const { session } = await createAgentSession({
  sessionManager,
  tools: [],
  // ...
});
```

- **Pros:**
  - No plaintext conversation files on disk
  - No storage lifecycle to manage
  - Works identically in containers and bare-metal
  - Preserves current stateless behaviour (frontend owns history)
  - Zero migration cost from current `fetch()`-based approach
  - SessionManager still provides tree structure, branching, context building — just without persist
- **Cons:**
  - Server restart loses all in-flight sessions
  - Cannot resume conversations after disconnect
  - Session metadata (listing, titles) must still come from Postgres

### Option B — SDK default JSONL persistence

Use `SessionManager.create()` — writes JSONL files to `~/.pi/agent/sessions/`.

- **Pros:**
  - Zero-effort persistence
  - Session resume works "for free"
  - SDK handles compaction and branching automatically
- **Cons:**
  - Plaintext PII on disk in a multi-tenant server — security risk
  - No storage lifecycle — files accumulate indefinitely
  - Breaks in containerised deployments
  - CWD-encoded paths make no sense in server context
  - Adds complexity with zero product requirement behind it

### Option C — Custom encrypted persistence to DB

Implement a custom `SessionManager` subclass that persists to the existing PostgreSQL `sessions` table (or a new `session_messages` table), optionally encrypting sensitive content.

- **Pros:**
  - Full control over storage, encryption, lifecycle
  - Aligns with existing ubek infrastructure (Postgres, JWT auth)
  - Tenant-aware by design
- **Cons:**
  - Significant upfront engineering — implementing the `SessionManager` interface correctly requires understanding tree branching, compaction, entry migration (v1→v3), and the 20+ entry types
  - Premature optimisation — we don't know the persistence requirements yet
  - The SDK's SessionManager interface is complex (40+ methods, tree traversal, branching, labels, compaction)
  - Risk of bugs in custom implementation breaking session context building

## Decision

**Adopt Option A: In-memory sessions only.**

```typescript
import { SessionManager, createAgentSession } from "@earendil-works/pi-coding-agent";

const sessionManager = SessionManager.inMemory();
const { session } = await createAgentSession({
  sessionManager,
  tools: [],
  model: resolvedModel,
});
```

Sessions exist only for the duration of the `AgentSession` instance. When the SDK adapter (see ADR-003) finishes streaming and calls `session.dispose()`, all conversation state is discarded.

Session **metadata** (id, title, messageCount) continues to be stored in the existing PostgreSQL `sessions` table via the existing `GET /chat/sessions` endpoint. The frontend remains the authoritative store for message content.

We will revisit persistence when at least one of the following is true:
- Product requirement formalises session resume/retention
- Audit requirement mandates server-side conversation storage
- Tenants request conversation history across devices

## Consequences

### Easier
- **Security**: No conversation data written to disk. No cleanup responsibility.
- **Deployment**: Works identically in containers, serverless, or bare-metal.
- **Migration path**: Current behaviour (stateless, frontend-owned history) is preserved.
- **Simplicity**: No custom SessionManager implementation needed now.

### Harder
- **No session resume**: If the server restarts or the AgentSession is disposed, the conversation context is lost. The user would need to start a new session.
- **Frontend remains history owner**: The frontend must continue to manage and persist conversation history. If requirements change, we add persistence later — with full context of what's needed.
- **Potential future migration**: Adding persistence later means migrating from `inMemory()` to a custom or SDK-default `SessionManager`. The adapter layer (ADR-003) should abstract the session manager to make this easier.

### Trade-off
Simplicity and security over persistence. We explicitly choose _not_ to add a capability (session persistence) that has no product requirement, rather than inheriting a default (JSONL files) that creates security and operational debt.

The cost is a future migration when persistence requirements emerge — but that migration will be informed by real requirements rather than speculative design.

---

## Withdrawal Note (2026-06-02)

This ADR is withdrawn. Phase 1 requires FULL persistence of session state in PostgreSQL (`sessions` table per tenant_id). Server restarts must NOT clear conversation context. Replaced by ADR-012.

**Reason:** In-memory sessions break the facade requirement that every tenant appears to have full premium functionality. A chatbot that forgets everything on restart is not acceptable for first client.