# UBEK — Implementation Plan & Test Checklist

**Project:** UBEK — Agent-as-a-Service Platform  
**Version:** 1.0  
**Date:** 2026-06-02  
**Status:** Phase 1 (MVP) — validation with first client

---

## Overview

UBEK is a platform that sells AI intelligence to small businesses as a service. Each user gets their own personal Pi Agent that grows with them — the user requests features through conversation, the admin configures them through data-driven facade.

**Architecture Principle:** Backend NEVER calls LLM models directly. Everything goes through Router LLM (:18881). Phase 1 uses **architectural facade** (Data-Driven Configuration) to minimize time-to-market.

**Target:** 1-20 users in Phase 1, single VPS, max €50/month LLM cost. Success = retention + willingness to pay.

---

## Current State (as of 2026-06-02)

| Area | Status |
|------|--------|
| Chat SSE streaming | ✅ Working |
| Auth (JWT + bcrypt) | ✅ Working |
| Guardrails (injection, rate limit, audit) | ✅ Working |
| Vault (file upload) | ✅ Working |
| Frontend (Next.js + shadcn/ui) | ✅ Building |
| Chat actions (retry, copy, edit) | ✅ In code |
| Markdown + LaTeX rendering | ✅ In code |
| Admin API (11 endpoints) | ✅ Backend exists |
| Session history API | ✅ Backend exists |
| MemoryService (extractAndStore + searchRelevant) | ✅ Service exists |
| Admin Dashboard (frontend) | ❌ Not built |
| Memory API full integration | ⚠️ Partially |
| Session history (UI) | ⚠️ Template exists |
| Knowledge Base UI | ⚠️ Partial |

---

## STAGE 1 — MVP (Core Chat)

**Goal:** A working chat interface the user can talk to.

### Features
- Chat with SSE streaming
- Context within one conversation (15+ messages)
- Bot responds in user's language (PL/EN)
- Consistent personality
- Graceful error handling

### Implementation Tasks
| # | Task | Files | Effort |
|---|------|-------|--------|
| 1.1 | Chat endpoint with streaming | Done | ✅ |
| 1.2 | Frontend chat UI | Done | ✅ |
| 1.3 | Auth (JWT + guardrails) | Done | ✅ |
| 1.4 | System prompt + personality | Done | ✅ |

### Acceptance Test Checklist (STAGE 1)

| ID | Test | Steps | Expected | Status |
|----|------|-------|----------|--------|
| TC-1.1 | Send + receive | Navigate to chat → type "Cześć!" → send | Bot responds | ✅ |
| TC-1.2 | Streaming | Send long prompt → watch response appear | Partial < final content | ✅ |
| TC-1.3 | Context (12 turns) | 12 Italy questions → "Co mówiłeś o transporcie?" | References earlier answer | ✅ |
| TC-1.4 | Polish language | "Cześć, jak się masz?" | Polish response | ✅ |
| TC-1.5 | Language switch | PL → "Speak English" → "Wróć do polskiego" | Each in correct language | ✅ |
| TC-1.6 | Admits not knowing | "Pogoda na Marsie 1892?" | "Nie wiem", no hallucination | ✅ |
| TC-1.7 | Personality stable | Ask "Kim jesteś?" 3x between other messages | Always "UBEK" | ✅ |
| TC-1.8 | Error resilience | Empty msg, 5000 chars, rapid clicks | No crashes | ✅ |
| TC-1.9 | Long conversation | 15+ messages on same topic | Context maintains throughout | ✅ |

**Stage 1 PASS CRITERIA:** All TC-1.x pass ✅

---

## STAGE 2 — Useful Chatbot

**Goal:** A chatbot with history, message actions, file support, and rich rendering.

### Features
- Session history (save + load conversations)
- Retry / Edit / Copy message actions
- Markdown + LaTeX rendering
- File upload + basic analysis
- Empty state for new users

### Implementation Tasks
| # | Task | Files | Effort |
|---|------|-------|--------|
| 2.1 | Session history API | Done (server/src/routes/chat.ts) | ✅ |
| 2.2 | Session history UI | frontend/app/history/page.tsx → HistoryPage template | 3h |
| 2.3 | Retry button | Done (CentralChat.tsx) | ✅ |
| 2.4 | Edit message | Done (CentralChat.tsx) | ✅ |
| 2.5 | Copy response | Done (CentralChat.tsx) | ✅ |
| 2.6 | Markdown rendering | Done (ReactMarkdown) | ✅ |
| 2.7 | LaTeX rendering | Done (rehypeKatex) | ✅ |
| 2.8 | File upload | Done (Vault API + CentralChat) | ✅ |
| 2.9 | File analysis | Done (attachment injection) | ✅ |
| 2.10 | Empty state UI | frontend/components/Chat/CentralChat.tsx | 30min |

### Acceptance Test Checklist (STAGE 2)

| ID | Test | Steps | Expected | Status |
|----|------|-------|----------|--------|
| TC-2.1 | Session history | 3 messages → reload → sidebar → click session | Previous messages visible | ⚠️ |
| TC-2.2 | Regenerate | "3 pomysły na firmę" → retry 4x | Different each time | ✅ |
| TC-2.3 | Edit message | "Stolica Francji?" → edit → "Niemiec?" | Response mentions Berlin | ✅ |
| TC-2.4 | Copy response | Send → click copy | Clipboard has response | ✅ |
| TC-2.5 | Markdown render | Ask for table + code | HTML table, pre, ul/ol | ✅ |
| TC-2.6 | LaTeX render | "Wzór na pole koła LaTeX" | rendered formula, no raw $$ | ✅ |
| TC-2.7 | File upload | Upload file → "Podsumuj" | Bot references file | ✅ |
| TC-2.8 | Empty history | New user → /chat | Empty state, not error | ⚠️ |
| TC-2.9 | Context after reload | Send → reload → click session → "Co ustaliliśmy?" | Continues conversation | ⚠️ |

**Stage 2 PASS CRITERIA:** All TC-2.x pass

---

## STAGE 3 — Good Chatbot (Context Injection)

**Goal:** The agent appears to remember facts across sessions and search user documents — implemented through context injection into LLM window, not separate infrastructure.

### Features
- File parsing + context injection (PDF, images, web scrapes directly into prompt)
- Sub-agents as SQL records (separate sessions with custom system_prompt + context_text)
- Source citations in responses
- Document generation (PDF/MD/DOCX)
- AbortController for SSE (token cost optimization)

### Implementation Tasks
| # | Task | Files | Effort |
|---|------|-------|--------|
| 3.1 | Data-driven context injection | server/src/routes/chat.ts — inject parsed file content as system messages | 1h |
| 3.2 | Sub-agents via SQL records | sessions table: add system_prompt, context_text, tool_mapping columns | 1h |
| 3.3 | AbortController for SSE | server/src/routes/chat.ts — wrap fetch with abort signal | 30min |
| 3.4 | Full session persistence (ADR-002 withdrawn) | Remove in-memory SessionManager, use DB exclusively | 2h |
| 3.5 | Source citations rendering | CentralChat.tsx — cite source documents in responses | 2h |
| 3.6 | Document generation | Done (generateDocument in useChat.ts) | ⚠️ Verify UI |
| 3.7 | Knowledge Base UI | frontend/components/KBPanel.tsx | 4h |

### Acceptance Test Checklist (STAGE 3)
| ID | Test | Steps | Expected | Status |
|----|------|-------|----------|--------|
| TC-3.1 | Context injection | Upload PDF → "Podsumuj" → reload → "Co było w dokumencie?" | Bot references file content | ❌ |
| TC-3.2 | Sub-agent personality | Create session with custom system_prompt → ask "Kim jesteś?" | Bot uses custom persona | ❌ |
| TC-3.3 | Source citations | Upload doc → query → check [Źródło N] | Source refs present | ❌ |
| TC-3.4 | Session persistence | Send 10 msgs → restart server → load session | All messages present | ❌ |
| TC-3.5 | AbortController | Start streaming → close tab → backend logs "aborted" | Token cost saved | ❌ |
| TC-3.6 | Document export | Send → export → download | .md/.pdf file | ❌ |

**Stage 3 PASS CRITERIA:** TC-3.1 + TC-3.4 pass (core facade), others optional for Phase 1

---

## STAGE 4 — Admin Dashboard & Extensions

**Goal:** Admin controls all agents, extension lifecycle, personality config, dynamic UI per user.

### Features
- Admin Dashboard (agent monitor, error console, activity logs)
- Dynamic Sidebar per user (extensions define available tabs)
- Extension Lifecycle (request → build → sandbox → deploy)
- Per-User Personality (configurable by admin)
- Extension Request Queue (user needs → admin dashboard)

### Implementation Tasks
| # | Task | Files | Effort |
|---|------|-------|--------|
| 4.1 | Admin Dashboard frontend | frontend/app/admin/ → agents, users, requests, settings | 4d |
| 4.2 | Dynamic Sidebar | extension-loader.ts + component-registry.ts | 2d |
| 4.3 | Agent Monitor | Admin UI → real-time session/error view | 2d |
| 4.4 | Extension Request Queue | Backend endpoint + admin UI | 3d |
| 4.5 | Extension Builder | .ts editor + sandbox preview | 5d |
| 4.6 | Extension Deploy Pipeline | Deploy → activate on specific tenant | 3d |
| 4.7 | Per-User Personality | Backend override + admin UI | 2d |

### Acceptance Test Checklist (STAGE 4)

| ID | Test | Steps | Expected | Status |
|----|------|-------|----------|--------|
| TC-4.1 | Admin Dashboard | Navigate to /admin → see overview | Metrics, clients, logs visible | ❌ |
| TC-4.2 | Agent list | Admin views all agents | List of users + agents | ❌ |
| TC-4.3 | Agent detail | Click agent → see sessions, prompts, errors | Session history + stats | ❌ |
| TC-4.4 | Error console | Agent errors appear in real-time | Log visible with stack trace | ❌ |
| TC-4.5 | Extension request | User says "potrzebuję X" → admin sees request | Appears in admin/requests/ | ❌ |
| TC-4.6 | Dynamic sidebar | User with Extension A → sees tab A. User without → no tab | Tabs appear/disappear | ❌ |
| TC-4.7 | Personality config | Admin sets personality → agent responds in that style | Style changes per user | ❌ |

**Stage 4 PASS CRITERIA:** TC-4.1 + TC-4.5 + TC-4.6 pass

---

## STAGE 5 — Vault Separation & Function Calling

**Goal:** Advanced file management, tool use, and agentic features.

| ID | Task | Effort |
|----|------|--------|
| 5.1 | Vault: Knowledge Base + Document Storage zones | 3d |
| 5.2 | Function Calling (web search, calculator) | 3d |
| 5.3 | Agentic Loop (decompose + plan) | 5d |
| 5.4 | Async Tasks with notifications | 5d |
| 5.5 | Human-in-the-loop | 3d |
| 5.6 | Observability panel (token counts, costs) | 2d |

### Acceptance Test Checklist (STAGE 5)

| ID | Test | Expected |
|----|------|----------|
| TC-5.1 | Vault KB vs Document Storage | Agent only uses KB for RAG unless explicitly asked |
| TC-5.2 | Drag & drop file move | Files move between KB and Doc Storage |
| TC-5.3 | Function calling | "Ile jest teraz godzin w Nowym Jorku?" → uses web search |
| TC-5.4 | Task planning | "Zrób research X i przygotuj plan" → bot decomposes |
| TC-5.5 | Agent saves to Doc Storage | Generated report auto-saves to Document Storage |

---

## Effort Summary

| Stage | Total Effort | Key Deliverables | Priority |
|-------|-------------|------------------|----------|
| **1** MVP | ✅ Done | Working chat with context | **Now** |
| **2** Useful | 4h remaining | History UI, empty state, context reload | **Before client** |
| **3** Facade | 5h | Context injection, full persistence, AbortController, sub-agents SQL | **Before client** |
| **4** Admin | 21d | Admin Dashboard, extensions, personality | **After validation** |
| **5** Advanced | 16d | Vault zones, function calling, agentic loop | **Phase 2** |

### Before First Client (Critical Path)

```
Week 1:
├── Full session persistence (DB, not memory) (2h)
├── Context injection for files (1h)
├── Sub-agents as SQL records (1h)
├── AbortController for SSE (30min)
├── History UI — get template working (3h)
├── Empty state + context reload fix (1h)
└── Test all TC-2.x + TC-3.1, TC-3.4 (2h)

Week 2:
├── Admin Dashboard — basic overview (2d)
├── Module distribution JSON config (1d)
├── Extension Request Queue (1d)
├── Dynamic Sidebar (2d)
└── First client onboarding
```

---

## Related Documents

| Document | Link |
|----------|------|
| Product Requirements | [docs/01-PRD.md](docs/01-PRD.md) |
| Architecture | [docs/02-ARCHITECTURE.md](docs/02-ARCHITECTURE.md) |
| User Workflows | [docs/03-USER-WORKFLOWS.md](docs/03-USER-WORKFLOWS.md) |
| Full Test Checklist | [docs/04-TEST-CHECKLIST.md](docs/04-TEST-CHECKLIST.md) |
| ADR Index | [docs/05-ADR-INDEX.md](docs/05-ADR-INDEX.md) |
| Context & Glossary | [docs/CONTEXT.md](docs/CONTEXT.md) |
| ADR Documents | [adrs/](adrs/) |
| Audit Report | [AUDYT-RAPORT.md](AUDYT-RAPORT.md) |
