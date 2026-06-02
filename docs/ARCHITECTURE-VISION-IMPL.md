# Architektura wizja: ubek × Pi Agent SDK

**Data:** 2025-05-27  
**Status:** Accepted  
**ADRs:** ADR-001 do ADR-006 (`docs/adrs/`)

---

## 1. Aktualny stan (przed)

```
Frontend (:3000)
    │ SSE ({ type: "status"|"text"|"done" })
    ▼
Backend Express 5 (:4000)
    ├── routes/chat.ts     → STUB (setInterval, symulowane tokeny)
    ├── routes/vision.ts   → STUB (setInterval, symulowane tokeny)
    ├── engine/PiAgentEngine.ts  → DEPRECATED (pusty stub)
    ├── guardrails/        → rate limiter, audit, injection detection
    ├── middleware/auth.ts → JWT (custom HS256, in-memory user store)
    └── utils/sse.ts       → sendSSEText, sendSSEDone, sendSSEError

BRAK integracji z LLM. BRAK sesji agenta. BRAK memory.
```

## 2. Stan docelowy (po)

```
Frontend (:3000)
    │ SSE ({ type: "status"|"text"|"done" }) ← BEZ ZMIAN
    ▼
Backend Express 5 (:4000) — CIENKI MOST
    ├── auth + guardrails  → BEZ ZMIAN
    ├── PiAgentService.ts  → NOWY: adapter do SDK
    ├── TenantSessionPool  → NOWY: per-tenant AgentSession cache
    ├── SdkSseAdapter      → NOWY: SDK events → SSE transform
    │
    ▼
Pi Agent SDK (@earendil-works/pi-coding-agent v0.75.5)
    ├── createAgentSession({ tools: DefaultTools, model, sessionManager: inMemory })
    ├── session.prompt()        → LLM turn
    ├── session.subscribe()     → text_delta events → SSE
    └── SessionManager.inMemory → brak persistence
```

## 3. Kluczowe decyzje architektoniczne

| Decyzja | Wybór | Uzasadnienie |
|---------|-------|-------------|
| Narzędzia agenta | `tools: [DefaultTools]` — vision, file upload, document gen, web search, memory | Sandboxed per extension (nadpisuje ADR-001) |
| Pamięć sesji | `SessionManager.inMemory()` | Brak persistence do odczytu (ADR-002) |
| SSE schema | Adapter SDK→ubek events | Zero zmian we frontendzie (ADR-003) |
| Izolacja tenantów | Per-tenant AgentSession | Pełna izolacja konwersacji (ADR-004) |
| Retry | SDK retry OFF, ubek-level 1 retry | Szybsze feedback dla UX (ADR-005) |
| Rollout | Feature flag `UBEK_CHAT_BACKEND` | Błyskawiczny rollback (ADR-006) |

## 4. Pliki — co się zmienia

### Nowe pliki
```
server/src/
├── services/
│   ├── PiAgentService.ts      ← NOWY: adapter + session pool
│   └── SdkSseAdapter.ts       ← NOWY: SDK events → SSE transform
├── config.ts                  ← NOWY: env config (feature flag)
```

### Zmodyfikowane pliki
```
server/src/
├── routes/chat.ts             ← DODAJ: feature flag → stub/sdk
├── routes/vision.ts           ← OPCJONALNIE: to samo dla vision
└── package.json               ← DODAJ: @earendil-works/pi-coding-agent
```

### Pliki do usunięcia
```
server/src/
└── engine/
    └── PiAgentEngine.ts       ← USUŃ: pusty deprecated stub
```

### Pliki BEZ zmian
```
server/src/
├── index.ts                   ← BEZ ZMIAN
├── middleware/auth.ts         ← BEZ ZMIAN
├── guardrails/*               ← BEZ ZMIAN
├── models/user.ts             ← BEZ ZMIAN
├── utils/sse.ts               ← BEZ ZMIAN
├── types/*                    ← BEZ ZMIAN
└── __tests__/*                ← DODAJ: testy adaptera
```

## 5. Nowa architektura PiAgentService.ts

```typescript
// server/src/services/PiAgentService.ts

import {
  createAgentSession,
  SessionManager,
  SettingsManager,
  type AgentSession,
} from "@earendil-works/pi-coding-agent";
import { getModel } from "@earendil-works/pi-ai";
import { SdkSseAdapter } from "./SdkSseAdapter.js";

// ---------------------------------------------------------------------------
// Tenant-scoped session pool
// ---------------------------------------------------------------------------
class TenantSessionPool {
  private sessions = new Map<string, { session: AgentSession; lastUsed: number }>();
  private readonly TTL_MS = 30 * 60 * 1000; // 30 min idle timeout

  async getOrCreate(tenantId: string): Promise<AgentSession> {
    const existing = this.sessions.get(tenantId);
    if (existing) {
      existing.lastUsed = Date.now();
      return existing.session;
    }

    // Tenant-isolated

... [OUTPUT TRUNCATED - 1705 chars omitted out of 11705 total] ...

apter.start();
        await session.prompt(userMessage);
        return; // Success

      } catch (err) {
        if (attempt <= MAX_RETRIES && isTransientError(err)) {
          sendSSEEvent(res, "status", {
            status: `⏳ Retrying... (${attempt + 1}/${MAX_RETRIES + 1})`,
          });
          continue;
        }
        sendSSEError(res, err instanceof Error ? err.message : "Stream failed");
        return;
      }
    }
  }
}

function isTransientError(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return (
      msg.includes("timeout") ||
      msg.includes("rate limit") ||
      msg.includes("429") ||
      msg.includes("5") ||  // 500, 502, 503
      msg.includes("fetch failed") ||
      msg.includes("econnrefused")
    );
  }
  return false;
}
```

## 6. SdkSseAdapter.ts

```typescript
// server/src/services/SdkSseAdapter.ts

import type { Response } from "express";
import type { AgentSession } from "@earendil-works/pi-coding-agent";
import { sendSSEEvent, sendSSEText, sendSSEDone } from "../utils/sse.js";

/**
 * Adapts SDK AgentSession events → ubek SSE protocol.
 *
 * SDK events consumed:
 *   text_delta  → SSE "text" event
 *   start       → SSE "status" event
 *   agent_end   → SSE "done" event (if not retrying)
 *
 * SDK events silently consumed:
 *   thinking_*, toolcall_* — not yet supported by frontend
 *
 * See ADR-003 for full rationale.
 */
export class SdkSseAdapter {
  private unsubscribe: (() => void) | null = null;

  constructor(
    private res: Response,
    private session: AgentSession,
  ) {}

  start(): void {
    this.unsubscribe = this.session.subscribe((event) => {
      try {
        switch (event.type) {
          case "message_update": {
            const e = event.assistantMessageEvent;
            switch (e.type) {
              case "text_delta":
                sendSSEText(this.res, e.delta);
                break;
              case "start":
                sendSSEEvent(this.res, "status", {
                  status: "Agent thinking...",
                });
                break;
              // thinking_*, toolcall_* — silently consumed
            }
            break;
          }

          case "agent_end": {
            if (!event.willRetry) {
              sendSSEDone(this.res);
            }
            break;
          }

          case "auto_retry_start":
          case "auto_retry_end":
          case "turn_start":
          case "turn_end":
          case "message_start":
          case "message_end":
          case "compaction_start":
          case "compaction_end":
            // Silently consumed per ADR-005 (retry disabled) and ADR-003
            break;
        }
      } catch (err) {
        console.error("[SdkSseAdapter] Error in event handler:", err);
      }
    });
  }

  stop(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }
}
```

## 7. Plan wdrożenia (fazy)

### Faza 0: Przygotowanie (1h)
- [ ] `npm install @earendil-works/pi-coding-agent@0.75.5` w server/
- [ ] Stwórz `server/src/config.ts` z `UBEK_CHAT_BACKEND` flag
- [ ] Stwórz `server/src/services/SdkSseAdapter.ts`
- [ ] Stwórz `server/src/services/PiAgentService.ts`
- [ ] Zapisz wszystkie ADR-y do `server/docs/adrs/`

### Faza 1: SDK path = stub behaviour (2h)
- [ ] Zaimplementuj `SdkSseAdapter` z mapowaniem `text_delta → SSE text`
- [ ] Zaimplementuj `PiAgentService` z `tools: DefaultTools`, `SessionManager.inMemory()`
- [ ] Dodaj feature flag w `routes/chat.ts`: gdy `sdk`, użyj `PiAgentService`
- [ ] **Verify**: Uruchom z `UBEK_CHAT_BACKEND=sdk` — powinno działać jak stub

### Faza 2: Testy (1.5h)
- [ ] Unit testy `SdkSseAdapter` (mock SDK events → expected SSE output)
- [ ] Unit testy `TenantSessionPool` (creation, reuse, eviction)
- [ ] Integration test: `POST /api/chat` z SDK path → SSE response
- [ ] **Verify**: Wszystkie istniejące testy auth/validation przechodzą

### Faza 3: Produkcja — canary (1h)
- [ ] Deploy z `UBEK_CHAT_BACKEND=stub` (default — brak zmiany)
- [ ] Ręcznie przełącz na `sdk` dla wewnętrznych tenantów
- [ ] Monitoruj: error rate, latency, SSE event ordering
- [ ] **Rollback if**: error rate ≥1% lub latency ≥500ms wzrost

### Faza 4: Cleanup (0.5h)
- [ ] Po 1 tygodniu 100% SDK: usuń feature flag
- [ ] Usuń `PiAgentEngine.ts` (deprecated stub)
- [ ] Usuń stub code z `chat.ts`
- [ ] **Verify**: Kod nie zawiera martwych ścieżek

## 8. Boundaries

### In scope
- `POST /api/chat` — SDK-powered streaming
- Per-tenant session isolation
- SSE adapter (SDK events → ubek protocol)
- Feature flag + phased rollout
- Usunięcie PiAgentEngine.ts
- Admin Dashboard — kontrola agentów, extension builder, sandbox, deploy
- Extension lifecycle przez admina (request → build → test → deploy)

### Out of scope (na później)
- `POST /api/vision` — pozostaje stubem na razie
- Persystencja sesji — wrócimy gdy będzie requirement
- Thinking blocks w SSE — wrócimy gdy frontend gotowy
- Memory (pgvector) — dedykowany serwis na :18765, osobny od Memory API ArndtOs

## 9. ADR Index

| ADR | Tytuł | Status |
|-----|-------|--------|
| ADR-001 | No default tools in server | SUPERSEDED |
| ADR-002 | In-memory sessions only | Proposed |
| ADR-003 | SDK adapter with explicit SSE schema | Proposed |
| ADR-004 | Per-tenant AgentSession isolation | Proposed |
| ADR-005 | Disabled auto-retry in chat endpoints | Proposed |
| ADR-006 | Feature flag for phased rollout | Proposed |

## 10. Risk Matrix (top 5)

| # | Ryzyko | Score | Mitigation |
|---|--------|-------|------------|
| R5 | Default tools RCE risk | 25 | Sandbox per extension + tool validation |
| R17 | Non-deterministic LLM breaks tests | 20 | Mock SDK events, test adapter shape |
| R3 | Session lifecycle mismatch | 16 | TenantSessionPool z reuse |
| R7 | Brak tenant isolation w SDK | 16 | Per-tenant agentDir + SessionManager |
| R8 | Prompt injection via skills | 15 | ResourceLoader auto-discovery OFF |