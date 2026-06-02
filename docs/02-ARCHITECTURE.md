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

## 1a. Facade Architecture (Data-Driven Configuration)

Faza 1 stosuje **architektoniczna fasade** - kazdy tenant sprawia wrazenie posiadania pelnych funkcjonalnosci premium, podczas gdy pod maska realizacja jest maksymalnie uproszczona.

| Obszar | Fasada (Phase 1) | Prawdziwa implementacja (Phase 2) |
|--------|------------------|-----------------------------------|
| Personalizacja | system_prompt + kontekst tekstowy per sesja (SQL) | Silnik regul + ML profilowanie |
| "Sub-agenci" | Osobne watki SQL z dedykowanym promptem i plikami | Agentic Loop + A2A |
| Bazy wiedzy | Wstrzykniecie tekstu/obrazow w okno kontekstowe Router LLM | pgvector + RAG pipeline |
| OCR / ekstrakcja | Zrzucone na zewnetrzne modele LLM przez Router | Dedicated OCR service |
| Dystrybucja modulow | Rekordy JSON w DB + mapowanie tenant_id | Core-and-Extension Marketplace |

**Zasada:** W Fazie 1 wszystko co moze byc rekordem SQL + promptem - jest. Over-engineering jest wrogiem. Celem jest walidacja, nie skalowalnosc.

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

**Default personality:** Nie jest slodki jak ChatGPT/Claude/Gemini. Jest rzeczowy, pomocny, konkretny. Zad

... [OUTPUT TRUNCATED - 1348 chars omitted out of 11348 total] ...

nfiguracja (personality, extensiony)
+-- requests/     -> zgloszenia od uzytkownikow o nowe funkcje
+-- settings/     -> core ustawienia platformy, domyslny system prompt

**Extension lifecycle przez Admin Dashboard:**
1. User zglasza potrzebe -> requests/ -> nowy task
2. Admin otwiera builder -> tworzy .ts z pi.registerTool()
3. Admin testuje w sandboxie (izolacja, mock usera)
4. Admin deployuje na konkretnego tenanta
5. U usera pojawia sie nowa zakladka/sidebar

### 4.3 Data-Driven Sub-Agents

Sub-agenci oraz dedykowane nowe rozmowy oparte na konkretnych plikach sa realizowane wylacznie na poziomie danych - jako rekordy w PostgreSQL. Kazda sesja moze miec:
- Wlasny system_prompt (override globalnego)
- Przypisany kontekst tekstowy (sparsowany plik, web scraping, obrazy Base64)
- Osobny zestaw tool_mapping (ktore narzedzia sa dostepne)

Schemat:


To pozwala na tworzenie sub-agentow bez zadnej infrastruktury - to tylko rekordy w DB z roznymi promptami.

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


### 4.5 SSE Streaming z AbortController

Kazde strumieniowanie SSE musi wspierac przerwanie generowania (AbortController) po stronie backendu. Gdy klient zamyka polaczenie lub wysyla sygnal abort, backend:
1. Przerywa zapytanie do Router LLM
2. Zapisuje dotychczasowy output jako czesciowa odpowiedz
3. Oznacza sesje jako status: interrupted
4. Nie nalicza pelnych kosztow tokenow (oszczednosc)

Implementacja:


### 4.6 Module Distribution: Phase 1 vs Phase 2

**Phase 1 (do 20 uzytkownikow) - Dystrybucja statyczna:**
- Administrator modyfikuje obiekty konfiguracyjne JSON w bazie danych
- Mapowanie parametrow per tenant_id
- Serializacja modulu = skopiowanie rekordu + podminana tenant_id
- Brak automatycznego marketplace w kodzie

**Phase 2 (Core-and-Extension Marketplace):**
- Globalny rdzen wtyczki (Extensions) odizolowany od nadpisan klienta
- Extension_Overrides w bazie danych (JSON diff od core)
- Dependency Injection / Hooks dla automatycznego mergu
- Bezkosztowe replikowanie modulow miedzy tenantami
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
| ADR-003 | SDK adapter with explicit SSE schema | ✅ Adopted |
| ADR-004 | Per-tenant AgentSession isolation | ✅ Adopted |
| ADR-005 | Disabled auto-retry in chat | ✅ Adopted |
| ADR-006 | Feature flags for phased rollout | 📋 Proposed |
| ADR-002 | In-memory sessions only | ❌ **WITHDRAWN** |
| ADR-003 | SDK adapter with explicit SSE schema | ✅ Adopted |
| ADR-004 | Per-tenant AgentSession isolation | ✅ Adopted |
| ADR-005 | Disabled auto-retry in chat | ✅ Adopted |
| ADR-006 | Feature flags for phased rollout | 📋 Proposed |
| ADR-007 | Default Tools for Every Pi Agent | ✅ Adopted |
| ADR-008 | Admin Dashboard - kontrola agentow, builder, deploy | 📋 Proposed |
| ADR-009 | Per-User Personality - admin-config, neutral default | 📋 Proposed |
| ADR-010 | Per-User Dynamic UI - sidebar/tabs z extensionow | 📋 Proposed |
| ADR-011 | Data-Driven Facade Architecture (Phase 1) | ✅ Adopted |
| ADR-012 | Full Session Persistence (replaces ADR-002) | ✅ Adopted |
| — | SSE over WebSocket | ✅ Active |
| — | Router LLM jedyny provider | ✅ Enforced |
| — | PiAgentService przez SDK (future) | 📋 Accepted |
| — | Core-and-Extension Marketplace (Phase 2) | 📋 Proposed | Admin Dashboard - kontrola agentow, builder, deploy | Proposed |
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