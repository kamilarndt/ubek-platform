# ADR-012: Full Session Persistence (replaces ADR-002)

## Status
**Adopted** (2026-06-02)

## Context

ADR-002 proposed in-memory sessions only. This is insufficient for Phase 1 facade requirements — a chatbot that forgets everything on server restart does not appear premium.

The `sessions` table already exists in schema.sql with columns: `id`, `agent_id`, `tenant_id`, `title`, `messages`, `created_at`, `updated_at`.

## Decision

ADR-002 is **WITHDRAWN**. All session state MUST be persisted in PostgreSQL:

1. Every chat message is written to `sessions.messages` (JSONB)
2. Server restart does NOT clear conversation context
3. Session history survives process crashes and deploys
4. Each session can carry custom `system_prompt`, `context_text`, `tool_mapping` (columns added to `sessions` table)

### Schema Changes

```sql
ALTER TABLE sessions ADD COLUMN system_prompt TEXT;
ALTER TABLE sessions ADD COLUMN context_text TEXT;
ALTER TABLE sessions ADD COLUMN tool_mapping JSONB DEFAULT '{}';
```

### Implementation

```typescript
// On each message
await db.query(
  `UPDATE sessions SET messages = $1, updated_at = NOW() WHERE id = $2`,
  [JSON.stringify(allMessages), sessionId]
);

// On session load
const { rows } = await db.query(
  `SELECT * FROM sessions WHERE id = $1 AND tenant_id = $2`,
  [sessionId, tenantId]
);
```

## Consequences

**Easier:**
- Sessions survive restarts and crashes
- Full conversation history available for audit
- Foundation for session history UI

**Harder:**
- DB write on every message (mitigation: async write, debounce)
- Storage grows with conversations (mitigation: 50MB limit per tenant for Phase 1)

## Related

- ADR-002: Withdrawn by this ADR
- ADR-011: Data-Driven Facade Architecture