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

## Iteration 1: History & Data-Driven Context (Priority)

**Goal:** Full session persistence in PostgreSQL + data-driven context injection. AbortController for SSE.

### Task 1.1: Full Session Persistence (replaces ADR-002)

| Field | Value |
|-------|-------|
| **Test** | TC-2.9 |
| **Feature** | Session history persists in PostgreSQL per tenant_id. Server restart does NOT clear context. |
| **Why** | ADR-002 withdrawn. Restarty serwera nie moga czyscic kontekstu uzytkownika. |
| **Changes** | Remove in-memory SessionManager. All sessions go through `sessions` table in schema.sql. |
| **Acceptance** | Send 10 msgs -> restart server -> load session -> all messages present |
| **Effort** | 2h |

### Task 1.2: Data-Driven Context Injection

Instead of Memory API, inject parsed file content + web scrape text + images (Base64) directly into LLM context window via Router LLM. OCR and extraction delegated to external models (90% compute offloaded).

| Field | Value |
|-------|-------|
| **Test** | TC-3.1 |
| **Feature** | User uploads PDF/image -> backend sends parsed text/Base64 in prompt to Router LLM |
| **Why** | Memory API is overkill for Phase 1. Context window of modern LLMs is sufficient for 20-user scale. |
| **Changes** | `server/src/routes/chat.ts` — on file attachment, parse content and inject as `{role: "system", content: "File contents: ..."}` |
| **Acceptance** | Upload PDF -> "Podsumuj" -> bot references content |
| **Effort** | 1h |

### Task 1.3: Sub-Agents as SQL Records

| Field | Value |
|-------|-------|
| **Test** | TC-2.1 |
| **Feature** | "Sub-agent" = separate session with dedicated system_prompt + context_text in DB |
| **Why** | Zero infrastructure. Just SQL records with different prompts. |
| **Changes** | `sessions` table: add `system_prompt`, `context_text`, `tool_mapping` columns. Backend reads these on session load. |
| **Acceptance** | Create session with custom system_prompt -> bot uses that personality and context |
| **Effort** | 1h |

### Task 1.4: AbortController for SSE Streaming

| Field | Value |
|-------|-------|
| **Test** | — |
| **Feature** | Client disconnect -> backend cancels LLM request via AbortController |
| **Why** | Token cost optimization. No point streaming to a closed connection. |
| **Changes** | `server/src/routes/chat.ts` — wrap fetch in AbortController, handle `req.on('close')` |
| **Acceptance** | Start streaming -> close tab -> backend logs "request aborted" |
| **Effort** | 30min |

### Task 1.5: Session History Sidebar (Frontend)

| Field | Value |
|-------|-------|
| **

... [OUTPUT TRUNCATED - 2795 chars omitted out of 12795 total] ...

passes: click → clipboard has content |
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

## Iteration 5+: Data-Driven Module Distribution (Phase 1) & Core-and-Extension (Phase 2)

### Phase 1: Static Module Distribution
- Admin modifies JSON config objects in DB
- Parameter mapping per tenant_id
- Module copy = duplicate record + change tenant_id
- No automated marketplace code

### Phase 2: Core-and-Extension Marketplace
- Global extension core isolated from client overrides
- Extension_Overrides table (JSON diff from core)
- Dependency Injection / Hooks for auto-merge
- Cost-free module replication between tenants

## Iteration 6+: Agent Features

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