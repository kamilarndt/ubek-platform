# ADR-003: SDK Adapter Layer with Explicit SSE Schema

## Status
Proposed

## Context

The current `chat.ts` endpoint emits SSE events with this schema:

```
{ type: "status", status: string }     // Status updates ("🧠 UBEK Agent thinking...")
{ type: "text", content: string }      // Token-by-token text deltas
{ type: "done", sessionId: string }    // Stream complete
```

The Pi Agent SDK emits a fundamentally different event model through `session.subscribe(listener)`:

```
AgentSessionEvent (discriminated union):

Message lifecycle:
  message_start    → { type: "message_start", message }
  message_update   → { type: "message_update", message, assistantMessageEvent }
  message_end      → { type: "message_end", message }

Where assistantMessageEvent is one of (from @earendil-works/pi-ai/types.ts):
  { type: "start", partial }
  { type: "text_start", contentIndex, partial }
  { type: "text_delta", contentIndex, delta, partial }
  { type: "text_end", contentIndex, content, partial }
  { type: "thinking_start", contentIndex, partial }
  { type: "thinking_delta", contentIndex, delta, partial }
  { type: "thinking_end", contentIndex, content, partial }
  { type: "toolcall_start", contentIndex, partial }
  { type: "toolcall_delta", contentIndex, delta, partial }
  { type: "toolcall_end", contentIndex, toolCall, partial }
  { type: "done", reason, message }
  { type: "error", reason, error }

Turn/agent lifecycle:
  turn_start, turn_end, agent_start, agent_end, auto_retry_start, auto_retry_end
```

There is a **mismatch** at three levels:

1. **Event granularity**: SDK emits per-content-block events (`text_start`, `text_delta`, `text_end`) for each content index. Current ubek emits flat tokens.

2. **Content types**: SDK supports `text`, `thinking`, and `toolCall` content blocks. Current ubek only handles text.

3. **Lifecycle events**: SDK emits turn/agent lifecycle. Current ubek only emits status + text + done.

### Constraints

- Changing the frontend SSE schema requires frontend changes — this is a breaking change for the SSE contract
- The SDK event model is richer than what the current frontend consumes
- A "thin bridge" architecture means the backend should transform, not dictate, the protocol
- `session.prompt()` is async and returns when the LLM turn completes — all streaming happens via events
- The adapter must handle errors, aborts, and cleanup

## Options Considered

### Option A — Direct SDK events to frontend (passthrough)

Expose the SDK's `AssistantMessageEvent` types directly in the SSE stream. Let the frontend handle `text_delta`, `thinking_delta`, `toolcall_*` natively.

- **Pros:**
  - Zero transformation logic on the backend
  - Frontend gets full event fidelity
  - Future tool/thinking support requires no backend changes
- **Cons:**
  - **Breaking change**: Frontend must rewrite SSE parsing to handle the new schema
  - Frontend currently expects `{type: "text", content: string}` — this changes to `{type: "text_delta", contentIndex, delta}`
  - Exposes SDK internals to the frontend — coupling the protocol to the SDK version
  - No abstraction layer to swap SDK implementations

### Option B — Thin adapter transforming SDK events → ubek SSE schema

Create an adapter class that subscribes to `AgentSession` events and transforms them into the current ubek SSE schema (`{type: "status"|"text"|"done"}`). The frontend sees no change.

- **Pros:**
  - **No frontend changes** — existing SSE parser works unchanged
  - Backend owns the transformation, can evolve independently
  - Adapter can be tested in isolation
  - Thinking blocks can be hidden or rendered as text (decision owned by backend)
  - Tool calls can be ignored or transformed into status messages
- **Cons:**
  - Transformation logic must map event types — some information is lost (e.g., content index, thinking vs text distinction)
  - Adapter is additional code to maintain
  - When the frontend eventually wants thinking/tool support, the adapter must be extended (or replaced with Option A at that point)

### Option C — Custom bridge (new SSE schema, backend-rendered)

Design a new, ubek-specific SSE schema that bridges both models — richer than current, but not SDK-coupled. Backend renders full response text; frontend receives pre-rendered chunks.

- **Pros:**
  - Schema designed for ubek's product needs, not SDK internals
  - Can be versioned independently of SDK
- **Cons:**
  - Still requires frontend changes (like Option A, but with a different schema)
  - Schema design is speculative — we don't know what the frontend will need
  - Most complex option: new schema + new adapter + frontend rewrite

## Decision

**Adopt Option B: Thin adapter that transforms SDK events → existing ubek SSE schema.**

```typescript
class SdkSseAdapter {
  private res: Response;
  private session: AgentSession;
  private unsubscribe: () => void;

  constructor(res: Response, session: AgentSession) {
    this.res = res;
    this.session = session;
  }

  start(): void {
    this.unsubscribe = this.session.subscribe((event) => {
      switch (event.type) {
        case "message_update": {
          const { assistantMessageEvent } = event;
          if (assistantMessageEvent.type === "text_delta") {
            this.sendText(assistantMessageEvent.delta);
          } else if (assistantMessageEvent.type === "start") {
            this.sendStatus("Agent thinking...");
          }
          break;
        }
        case "message_end": {
          // Don't send done here — wait for agent_end
          break;
        }
        case "agent_end": {
          if (!event.willRetry) {
            this.sendDone();
          }
          break;
        }
        case "error":  // Not in AgentSessionEvent — handled by try/catch around prompt()
        // Other events: silently ignored
      }
    });
  }

  stop(): void {
    this.unsubscribe();
  }

  private sendStatus(status: string): void { ... }
  private sendText(text: string): void { ... }
  private sendDone(): void { ... }
}
```

The adapter maps:

| SDK Event                              | Ubek SSE Event              |
|----------------------------------------|-----------------------------|
| `message_update` + `text_delta`        | `{ type: "text", content }` |
| `message_update` + `start`             | `{ type: "status" }`        |
| `agent_end` (willRetry=false)          | `{ type: "done" }`          |
| `thinking_delta`                       | Silently consumed (or `status`) |
| `toolcall_*`                           | Silently consumed           |
| `auto_retry_start` / `auto_retry_end`  | Silently consumed (see ADR-005) |

### Rationale

1. **No frontend changes** — this is the critical constraint. The frontend is already deployed and working.
2. **Backend decoupling** — if the SDK changes event shapes, only the adapter changes.
3. **Path to richer schema** — when the frontend needs thinking/tool support, we add new SSE event types in the adapter without breaking existing text events.

## Consequences

### Easier
- **Zero frontend changes** — existing SSE consumers work unchanged
- **Testable** — adapter can be unit-tested with mock SDK events
- **SDK version independence** — mapping logic is isolated in one file
- **Gradual enrichment** — can add new SSE event types (`thinking`, `tool_call`, `tool_result`) without breaking existing text flow

### Harder
- **Info loss**: Content indices, thinking vs text distinction, and tool call metadata are lost in the current schema
- **Extra code**: ~80-120 lines of adapter logic that wouldn't exist with a direct passthrough
- **Event ordering**: Must ensure `text_delta` → `text` ordering is correct even when SDK emits overlapping events (e.g., interleaved thinking and text)

### Trade-off
We trade **event fidelity** for **frontend compatibility**. The adapter loses information (thinking vs text, content indices, tool calls) but ensures the existing frontend continues to work without changes. When the frontend is ready for richer events, the adapter can be extended to pass through additional event types.

This is a deliberately conservative choice — the adapter is far easier to _extend_ than it would be to retrofit a breaking schema change on the frontend.