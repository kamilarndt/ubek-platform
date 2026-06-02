# UBEK — Implementation Plan (Test-Driven)

**Status:** Active · **Version:** 1.0 · **Date:** 2026-05-29
**Methodology:** Test-Driven — each feature is defined by its passing test case
**Source:** [Test Checklist](04-TEST-CHECKLIST.md)

---

## How to Read

| Column | Meaning |
|--------|---------|
| **Test** | TC id from test checklist — this test must pass |
| **Feature** | What to build |
| **Files** | Which files to create/modify |
| **Acceptance** | How to verify it's done (always: run the test) |

**Process for each task:**
1. Read the test definition in `04-TEST-CHECKLIST.md` and `frontend/e2e/`
2. Implement the feature
3. Run the test — it should pass
4. If test doesn't exist yet, write it first (TDD)

---

## Iteration 0: Security & Infrastructure (Today)

**Goal:** Fix P0 security issue, verify frontend builds. No new features.

| # | Task | Test | Files | Time |
|---|------|------|-------|------|
| 0.1 | Move JWT_SECRET to `.env` | SEC-5 | `server/.env`, `server/src/middleware/auth.ts` | 15min |
| 0.2 | Verify frontend build | TC-1.1 | `frontend/` (npm run build) | 15min |
| 0.3 | Verify backend starts | TC-1.2 | `server/` (npx tsx) | 5min |
| 0.4 | Run existing Playwright tests | All TC-1.x | `frontend/e2e/` | 10min |
| 0.5 | Document known test failures | — | — | 10min |

**Acceptance:** `SEC-5` passes (no hardcoded secret). Frontend builds. All TC-1.x pass or have documented reason.

---

## Iteration 1: History & Memory (Priority)

**Goal:** Session sidebar + Memory API integration. These unlock the most user value.

### Task 1.1: Memory API Backend Integration

| Field | Value |
|-------|-------|
| **Test** | TC-3.1 |
| **Feature** | Backend calls Memory API to store/retrieve user facts |
| **Why** | Memory API v2 runs on :18765 (dedykowane dla UBEK, nie ArndtOs). Backend ignores it. |
| **Changes** | `server/src/services/MemoryService.ts` (NEW) |
| | `server/src/routes/chat.ts` — after each response, async-save facts |
| | `server/src/index.ts` — remove "disabled" comment, wire it up |
| **API** | `POST /api/memory/extract` → extract facts from text |
| | `GET /api/memory/search?query=...` → find relevant facts |
| **Acceptance** | TC-3.1 passes: user says fact → reload → bot remembers |
| **Effort** | 2h |

### Task 1.2: Session History Sidebar (Frontend)

| Field | Value |
|-------|-------|
| **Test** | TC-2.1 |
| **Feature** | Sidebar with list of past conversations, click to load |
| **Why** | Backend API exists (`GET /api/chat/sessions`). No frontend. |
| **Changes** | `frontend/components/Sidebar.tsx` — session list UI |
| | `frontend/lib/useChat.ts` — loadSessions() (exists but unused in sidebar) |
| | `frontend/app/chat/page.tsx` — wire sidebar component |
| **UI** | List of sessions (title, date). Click → load messages. "New Chat" button. |
| **Acceptance** | TC-2.1 passes: send → reload → sidebar shows session → click → messages visible |
| **Effort** | 3h |

### Task 1.3: Simple Memory Panel (RODO)

| Field | Value |
|-------|-------|
| **Test** | TC-3.8 |
| **Feature** | User can view + delete stored facts |
| **Why** | Required for RODO compliance |
| **Changes** | `frontend/components/MemoryPanel.tsx` (NEW) |
| | Route in settings or sidebar |
| **UI** | List of facts with delete button per fact + "clear all" |
| **Acceptance** | TC-3.8 passes: view → delete → bot no longer knows deleted fact |
| **Effort** | 2h |

---

## Iteration 2: Chat Actions & Rendering

### Task 2.1: Retry Button

| Field | Value |
|-------|-------|
| **Test** | TC-2.2 |
| **Feature** | "Spróbuj ponownie" button on bot responses |
| **Changes** | `frontend/components/ChatMessage.tsx` — add retry button |
| | `frontend/lib/useChat.ts` — retry() exists, wire to button |
| **Acceptance** | TC-2.2 passes: retry 4x → each response different |
| **Effort** | 1h |

### Task 2.2: Copy Button

| Field | Value |
|-------|-------|
| **Test** | TC-2.4 |
| **Feature** | "Kopiuj" button on bot responses → clipboard |
| **Changes** | `frontend/components/ChatMessage.tsx` — add copy button |
| **Acceptance** | TC-2.4 passes: click → clipboard has content |
| **Effort** | 30min |

### Task 2.3: Markdown + LaTeX Rendering

| Field | Value |
|-------|-------|
| **Test** | TC-2.5, TC-2.6 |
| **Feature** | rehype-katex and react-markdown wired in chat |
| **Why** | Dependencies exist in package.json, just not connected |
| **Changes** | `frontend/components/ChatMessage.tsx` — wrap content in react-markdown + rehype-katex |
| **Acceptance** | TC-2.5 passes (table/list/code rendered). TC-2.6 passes (katex element present). |
| **Effort** | 1h |

### Task 2.4: Observability Panel

| Field | Value |
|-------|-------|
| **Test** | — (new F-12) |
| **Feature** | Admin panel showing token counts, cost estimates, latency |
| **Why** | Currently no visibility into LLM costs |
| **Changes** | `server/src/middleware/observability.ts` (NEW) — wraps LLM calls |
| | `server/src/routes/admin.ts` — add /api/admin/metrics endpoint |
| | `frontend/app/admin/page.tsx` — metrics display |
| **Acceptance** | After 5 chats, admin shows token counts and cost for each |
| **Effort** | 2h |

---

## Iteration 3: RAG & Document Management

### Task 3.1: Knowledge Base UI Manager

| Field | Value |
|-------|-------|
| **Test** | TC-3.2 |
| **Feature** | Frontend panel to create KBs, upload files, view status |
| **Why** | Backend CRUD exists. No frontend. |
| **Changes** | `frontend/components/KBPanel.tsx` (NEW) |
| **UI** | List KBs → upload file → see processing status → query |
| **Acceptance** | TC-3.2 passes: upload → query → answer from document |
| **Effort** | 4h |

### Task 3.2: Source Citations UI

| Field | Value |
|-------|-------|
| **Test** | TC-3.3, TC-3.7 |
| **Feature** | Clickable `[Źródło N]` → sidebar shows source preview |
| **Why** | `formatCitations()` and `parseSourceRefs()` exist. No UI rendering. |
| **Changes** | `frontend/components/CitationPopover.tsx` (NEW) |
| | Wire `splitTextWithRefs()` into ChatMessage rendering |
| **Acceptance** | TC-3.3 passes (source refs visible). TC-3.7 passes (source explained on ask). |
| **Effort** | 2h |

### Task 3.3: File Upload in Chat

| Field | Value |
|-------|-------|
| **Test** | TC-2.7 |
| **Feature** | Drag & Drop files into chat, bot analyzes them |
| **Changes** | `frontend/components/FileUpload.tsx` (NEW) |
| | `server/src/routes/chat.ts` — accept file attachments |
| **Acceptance** | TC-2.7 passes: upload → "Podsumuj" → bot references file content |
| **Effort** | 3h |

### Task 3.4: Document Export

| Field | Value |
|-------|-------|
| **Test** | TC-3.6 |
| **Feature** | Export chat as MD/PDF/DOCX |
| **Why** | `DocumentService.ts` exists, may need npm deps |
| **Changes** | Check `server/package.json` for pdfkit/docx |
| | `frontend/components/ExportButton.tsx` (NEW) |
| **Acceptance** | TC-3.6 passes: export → .md/.pdf/.docx downloaded |
| **Effort** | 2h |

---

## Iteration 4: Vault & Edit

### Task 4.1: Vault Zone Separation

| Field | Value |
|-------|-------|
| **Test** | — (new) |
| **Feature** | `zone` column: knowledge_base vs doc_storage |
| **Changes** | DB migration: ALTER TABLE vault_files ADD COLUMN zone |
| | `server/src/routes/vault.ts` — filter by zone |
| | `frontend/components/VaultPanel.tsx` — two tabs |
| **Acceptance** | KB zone used by RAG. Doc storage ignored unless user asks. |
| **Effort** | 3h |

### Task 4.2: Edit Message

| Field | Value |
|-------|-------|
| **Test** | TC-2.3 |
| **Feature** | Edit own message → re-send → new response |
| **Changes** | `frontend/components/ChatMessage.tsx` — edit button → inline edit |
| | `frontend/lib/useChat.ts` — editMessage() |
| **Acceptance** | TC-2.3 passes: "Francja" → edit → "Niemcy" → "Berlin" |
| **Effort** | 1h |

---

## Iteration 5+: Agent Features

| Task | Tests | Effort | Depends On |
|------|-------|--------|------------|
| Function Calling (Web Search, Calculator) | — | 3d | Router LLM tool support |
| Agentic Loop (decompose + plan) | — | 5d | Function Calling |
| Multi-document RAG (TC-3.4) | TC-3.4 | 2h | KB UI |
| RAG no hallucination (TC-3.5) | TC-3.5 | 1h | KB UI (prompt engineering) |
| Empty history (TC-2.8) | TC-2.8 | 30min | Session sidebar |
| Async tasks + push notifications | — | 5d | Agentic Loop |
| Human-in-the-loop | — | 3d | Agentic Loop |
| Voice (STT/TTS) | — | 5d | — |
| Deploy PM2 + Nginx on VPS | — | 1d | All of the above |

---

## Effort Summary

| Iteration | Total Time | Key Deliverables |
|-----------|-----------|------------------|
| **0** Security & Verify | 1h | JWT_SECRET fix, build verified |
| **1** History & Memory | 6h | Memory integration, session sidebar, RODO panel |
| **2** Chat Actions | 4h | Retry, Copy, Markdown, LaTeX, Observability |
| **3** RAG & Documents | 11h | KB UI, Citations, File upload, Export |
| **4** Vault & Edit | 4h | Zone separation, Edit message |
| **5+** Agent Features | 20h+ | Function Calling, Agentic Loop, Async, Voice |

**Total to ship a solid product (Iterations 0-4): ~26h**

---

## Running Tests During Implementation

```bash
# All tests
cd frontend && npx playwright test

# Single test file
npx playwright test e2e/stage1-mvp.spec.ts

# Single test (by name)
npx playwright test -g "TC-1.2"

# Headed mode (watch browser)
npx playwright test --headed

# With UI mode
npx playwright test --ui
```

**Pre-merge checklist:**
1. `npm run build` (frontend)
2. `npx playwright test e2e/stage1-mvp.spec.ts` (MVP tests)
3. New feature's tests pass
4. No regression in previously passing tests