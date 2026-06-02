# UBEK Architecture — Single Source of Truth

**Status:** Active · **Version:** 2.0 (consolidated) · **Updated:** 2026-05-29
**Supersedes:** ARCHITECTURE-VISION.md, ZLOTY-SRODEK.md, server ADRs

---

## 1. System Context

```
                    User (browser / Telegram)
                           │
              ┌────────────┴────────────┐
              │ HTTP/SSE                │ A2A
              ▼                         ▼
     ┌────────────────┐       ┌──────────────────┐
     │ Frontend       │       │ Pi Agent Ecosystem│
     │ Next.js (:3000)│       │ A2A Daemon(:18765)│
     │ React 19 + TW  │       │ 19 agents         │
     └───────┬────────┘       └──────────────────┘
             │ HTTP
             ▼
     ┌──────────────────────────────────────┐
     │      Backend Express (:4000)          │
     │ Auth │ Chat │ Vault │ RAG │ Guardrails│
     └─────┬────────┬──────────┬─────────────┘
           │        │          │
           ▼        ▼          ▼
     ┌────────┐┌────────┐┌──────────┐
     │ Router ││Postgres││Memory API│
     │LLM     ││(:5432) ││(:18765)   │
     │(:18881)││+pgvec  ││+pgvec    │
     └────────┘└────────┘└──────────┘
```

**Key Principle:** Backend NIGDY nie woła modeli LLM bezpośrednio. Wszystko przez Router LLM (:18881).
**Per-tenant UI:** Frontend jest jeden (Next.js + shadcn/ui). Sidebar i dostepne zakladki zaleza od extensionow usera. extension-loader.ts + component-registry.ts laduja komponenty dynamicznie. Bez extensionow → tylko Chat + Vault + Settings.

---

## 2. Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend | Next.js | 15.5.3 |
| Frontend UI | React | 19.1 |
| Frontend CSS | Tailwind CSS | 4 |
| Backend | Express (TypeScript) | — |
| Database | PostgreSQL 16 + pgvector | 1536d embeddings |
| LLM Router | Router LLM (:18881) | Free-first chain |
| Auth | JWT + bcrypt | — |
| Memory | Memory API (Python FastAPI) | v2 |
| Deploy | PM2 (Faza 1) → Docker/K8s (Faza 2) | — |

---

## 3. User Model (Key Differentiator)

| Aspect | Standard approach | UBEK |
|--------|-------------------|------|
| Feature set | Same for all users | **Each user = 1 Pi Agent** |
| Evolution | Linear stages (1→2→3) | **Organic** — agent grows with user |
| Customization | Settings | **Pi Extensions** — user asks, agent builds |
| Source of truth | Spec document | Code + Memory API + config |

**Practical:**
- All users share backend in Faza 1, but designed for per-tenant isolation (ADR-004)
- Memory API already stores per-user facts
- Different users can have different capabilities — no version freeze

---

### 3.2 User Personality

| Aspekt | Standardowe podejscie | UBEK |
|--------|----------------------|------|
| Domyslny styl | Empatyczny, slodki jak BigTech | Neutralny, rzeczowy asystent - zero przymilnosci |
| Per-user personality | Brak | Admin konfiguruje przez dashboard |

**Default personality:** Nie jest slodki jak ChatGPT/Claude/Gemini. Jest rzeczowy, pomocny, konkretny. Zadnych Swietnie! Absolutnie! Z przyjemnoscia!. Ma pomagac rozwiazywac problemy, nie glaskac ego.

---

## 4. Component Architecture

### 4.1 Frontend (`frontend/`)

```
app/ → (auth)/, chat/, vault/, agents/, admin/, document-generation/, vision/, extensions/{tenant}/

lib/
├── useChat.ts           # Chat hook: send, stream, sessions, retry
├── ChatContext.tsx       # Chat state provider
├── api-client.ts        # Fetch wrapper with JWT
├── api.ts               # API functions (KB, documents, vault)
├── component-registry.ts # Lazy-loaded tool registry
└── extension-loader.ts  # Per-tenant extension loading

e2e/                     # Playwright tests
├── stage1-mvp.spec.ts   # Tests TC-1.x
├── stage2-usable.spec.ts# Tests TC-2.x
└── stage3-advanced.spec.ts # Tests TC-3.x
```

**SSE Schema (CONSISTENT — do NOT break without frontend update):**
```
{ type: "status", status }       → Status updates
{ type: "text", content }        → Token-by-token text deltas
{ type: "done", sessionId }      → Stream complete
```

### 4.2 Admin Dashboard

Panel administratora /admin. Pozwala na pelna kontrole nad agentami, wdrazanie extensionow, monitorowanie bledow.

+-- agents/       -> lista agentow, podglad sesji, promptow, odpowiedzi
+-- extensions/   -> builder (tworzenie .ts), sandbox test, deploy na tenanta
+-- users/        -> per-user konfiguracja (personality, extensiony)
+-- requests/     -> zgloszenia od uzytkownikow o nowe funkcje
+-- settings/     -> core ustawienia platformy, domyslny system prompt

**Extension lifecycle przez Admin Dashboard:**
1. User zglasza potrzebe -> requests/ -> nowy task
2. Admin otwiera builder -> tworzy .ts z pi.registerTool()
3. Admin testuje w sandboxie (izolacja, mock usera)
4. Admin deployuje na konkretnego tenanta
5. U usera pojawia sie nowa zakladka/sidebar

### 4.3 Backend (`server/src/`)

```
routes/       → auth, chat (SSE), vault, rag, agents, documents, vision, research, admin, health
services/     → RAGService, DocumentService, PiAgentService (stub), SDKProxy (stub)
guardrails/   → chatGuard, injectionDetector, rateLimiter, auditLogger, tenantGuard
engine/       → AgentEngine, PiAgentEngine
channels/     → Telegram, WebSocket, WhatsApp providers
data/         → PostgreSQL pool, migrate, seed
```

### 4.3 Memory API (`memory-api/`)

Separate Python FastAPI on port 18765 (dedykowane dla UBEK, nie ArndtOs). PostgreSQL + pgvector (1024d).

**Status:** Active but NOT integrated with backend (comment: "disabled — handled by Pi Agent"). Fix: integrate before building memory features.

---

## 5. Security

| Layer | Status | Note |
|-------|--------|------|
| JWT auth (jsonwebtoken + bcrypt) | ✅ | Works |
| Prompt injection detection | ✅ | regex + heuristics |
| Rate limiting (per-tenant + global) | ✅ | Works |
| Audit logging (all API calls) | ✅ | Works |
| Tenant isolation (WHERE tenant_id = ?) | ✅ | DB level |
| JWT_SECRET hardcoded | ❌ **P0** | Move to `.env` |
| HTTPS on VPS | ❌ | Let's Encrypt + Nginx |

---

## 6. Data Model (PostgreSQL `ubekv2`)

Core tables: `tenants`, `users`, `agents`, `sessions`, `messages`, `vault_files`, `knowledge_bases`, `kb_files`, `memory_entries`, `memory_vectors`

Vault zones (future — add `zone` column):
- `knowledge_base` — user-uploaded files, RAG source
- `doc_storage` — agent-generated documents, agent write

---

## 7. Infrastructure

| Service | Local | Production |
|---------|-------|------------|
| Frontend | :3000 | VPS via PM2 |
| Backend | :4000 | VPS via PM2 |
| PostgreSQL | :5432 | VPS |
| Memory API | :18765 | VPS (dedykowane UBEK) |
| Router LLM | :18881 | VPS |
| A2A Daemon | :18765 | VPS |

**Production VPS:** Contabo Cloud VPS 20 · 164.68.106.162 · 6 vCPU / 11GB / €8.61/mo

---

## 8. Key Decisions (ADRs)

| ID | Decision | Status |
|----|----------|--------|
| ADR-001 | No default tools in server — `tools: []` | ✅ Adopted |
| ADR-002 | In-memory sessions only | ✅ Adopted |
| ADR-003 | SDK adapter with explicit SSE schema | ✅ Adopted |
| ADR-004 | Per-tenant AgentSession isolation | ✅ Adopted |
| ADR-005 | Disabled auto-retry in chat | ✅ Adopted |
| ADR-006 | Feature flags for phased rollout | 📋 Proposed |
| — | SSE over WebSocket
| ADR-008 | Admin Dashboard - kontrola agentow, builder, deploy | Proposed |
| ADR-009 | Per-User Personality - admin-config, neutral default | Proposed |
| ADR-010 | Per-User Dynamic UI - sidebar/tabs z extensionow | Proposed | | ✅ Active |
| — | Router LLM jedyny provider | ✅ Enforced |
| — | PiAgentService przez SDK (future) | 📋 Accepted |

---

## 9. What We Reject (Deliberately)

| Element | Why |
|---------|-----|
| WebSocket over SSE | SSE simpler, works with HTTP/2 |
| Voice/VAD in Faza 1 | Huge infra, low value per dollar |
| 1M-2M token context | Not cost-feasible |
| Self-optimizing prompts | Risk — unwanted evolution |
| Emotional voice synthesis | Sci-fi at current hardware level |
| Mobile apps | PWA after validation |
| SOC2 / enterprise compliance | Overkill for 20 users |