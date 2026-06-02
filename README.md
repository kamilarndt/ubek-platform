# UBEK — Agent-as-a-Service Platform

> **Każdy użytkownik ma własnego agenta AI który rozwija się razem z nim.**

---

## One-Page Summary

UBEK sprzedaje inteligencję AI małym firmom jako usługę. Każdy klient dostaje własnego, personalizowanego Pi Agenta. Agent rozwija się z użytkownikiem — klient mówi czego potrzebuje, admin (my) budujemy rozszerzenie, testujemy, wdrażamy.

**Model biznesowy:** Agent-as-a-Service (AaaS)  
**Faza:** 1 (MVP) — walidacja popytu, max 20 użytkowników  
**Stack:** Next.js 15 + Express + PostgreSQL 16 + pgvector + Router LLM  
**Koszt operacyjny:** ~€58/mo (VPS €8.61 + LLM ~€50)

**Kluczowe wyróżniki:**
- Każdy użytkownik = 1 Pi Agent z własną pamięcią i extensionami
- Admin Dashboard — pełna kontrola nad agentami, wdrażanie extensionów, monitorowanie błędów
- Per-User Personality — neutralny, rzeczowy asystent (nie BigTech "słodziak")
- Architektura przez Router LLM (:18881) — NIGDY bezpośrednie wołanie modeli
- Extension Lifecycle przez Admina — user zgłasza, admin buduje/testuje/deployuje

---

## Dokumentacja

| Dokument | Opis | 
|----------|------|
| [PLAN.md](PLAN.md) | **Implementation Plan + Test Checklists** — start here |
| [docs/01-PRD.md](docs/01-PRD.md) | Product Requirements — co budujemy i dlaczego |
| [docs/02-ARCHITECTURE.md](docs/02-ARCHITECTURE.md) | **Architektura — jedyne źródło prawdy** |
| [docs/03-USER-WORKFLOWS.md](docs/03-USER-WORKFLOWS.md) | Przepływy użytkownika |
| [docs/04-TEST-CHECKLIST.md](docs/04-TEST-CHECKLIST.md) | Master test checklist |
| [docs/05-ADR-INDEX.md](docs/05-ADR-INDEX.md) | Architectural Decision Records |
| [docs/06-IMPLEMENTATION-PLAN.md](docs/06-IMPLEMENTATION-PLAN.md) | Feature-level implementation tasks |
| [docs/CONTEXT.md](docs/CONTEXT.md) | Słownik pojęć i kontekst domenowy |
| [adrs/](adrs/) | Full ADR documents (ADR-001 through ADR-006) |
| [AUDYT-RAPORT.md](AUDYT-RAPORT.md) | System audit (2026-05-29) |

## Code Architecture

| File | Description |
|------|-------------|
| [code/server/index.ts](code/server/index.ts) | Server entry point — Express app, middleware, routing |
| [code/server/chat-route.ts](code/server/chat-route.ts) | Chat streaming (SSE), session management |
| [code/server/admin-route.ts](code/server/admin-route.ts) | Admin API — 11 endpoints for agent/client control |
| [code/server/MemoryService.ts](code/server/MemoryService.ts) | Memory API client — extract facts, search relevance |
| [code/server/PiAgentService.ts](code/server/PiAgentService.ts) | Pi Agent SDK bridge — session pool, streaming adapter |
| [code/server/schema.sql](code/server/schema.sql) | PostgreSQL schema (tenants, users, agents, sessions, vault) |
| [code/frontend/CentralChat.tsx](code/frontend/CentralChat.tsx) | Main chat component — streaming, retry, edit, markdown, uploads |
| [code/frontend/useChat.ts](code/frontend/useChat.ts) | Chat hook — session management, KB CRUD, document gen |
| [code/tests/stage1-mvp.spec.ts](code/tests/stage1-mvp.spec.ts) | E2E tests — core chat MVP |
| [code/tests/stage2-usable.spec.ts](code/tests/stage2-usable.spec.ts) | E2E tests — history, actions, files |

## Architecture Principles

1. **Pi Agent jest mózgiem, backend jest cienkim bridge'm** — backend nie zawiera logiki AI
2. **Router LLM (:18881) — JEDYNY provider** — nigdy bezpośrednie wołanie modeli
3. **Każdy użytkownik = 1 Pi Agent** — z własną pamięcią (pgvector), extensionami, system promptem
4. **Per-tenant isolation** — WHERE tenant_id = ? na każdym zapytaniu DB
5. **Admin buduje extensiony** — user zgłasza potrzebę, admin tworzy/testuje/deployuje
6. **Neutralny asystent** — default personality, admin może skonfigurować per-user
7. **Jeden frontend, dynamiczny sidebar** — zakładki zależą od extensionów usera

## Key ADR Decisions

| ADR | Title | Status |
|-----|-------|--------|
| ADR-001 | No Default Tools in Server | **SUPERSEDED** (→ default tools every agent) |
| ADR-002 | In-Memory Sessions Only | Proposed |
| ADR-003 | SDK Adapter with SSE Schema | Proposed |
| ADR-004 | Per-Tenant AgentSession Isolation | Proposed |
| ADR-005 | Disabled Auto-Retry in Chat | Proposed |
| ADR-006 | Feature Flag for Phased Rollout | Proposed |
| ADR-007 | Default Tools for Every Pi Agent | ✅ Adopted |
| ADR-008 | Admin Dashboard — agent monitor, builder, deploy | 📋 Proposed |
| ADR-009 | Per-User Personality — admin-config, neutral default | 📋 Proposed |
| ADR-010 | Per-User Dynamic UI — sidebar/tabs from extensions | 📋 Proposed |

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15.5.3 + React 19.1 + Tailwind CSS 4 (shadcn/ui) |
| Backend | Express (TypeScript, tsx) |
| Database | PostgreSQL 16 + pgvector |
| LLM Router | Router LLM (:18881) — free-first chain |
| Auth | JWT (jsonwebtoken) + bcrypt |
| Memory | Memory API (:18765) — Python FastAPI + pgvector |
| E2E Tests | Playwright |
| Deploy | PM2 → Docker/K8s (Phase 2) |

## Infrastructure

| Service | Port | 
|---------|------|
| Frontend | :3000 |
| Backend | :4000 |
| PostgreSQL | :5432 |
| Memory API | :18765 (dedykowane UBEK) |
| Router LLM | :18881 |
| Production VPS | Contabo Cloud VPS 20 · 6 vCPU / 11GB / €8.61/mo |

---

*Repozytorium do second opinion. Utworzone: 2026-06-02*
