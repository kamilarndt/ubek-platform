# UBEK — Master Test Checklist

**Status:** Active · **Version:** 2.0 (consolidated) · **Updated:** 2026-05-29
**Supersedes:** previous TEST-PLAN.md
**Source:** [Playwright tests](../frontend/e2e/), [Audit](../AUDYT-RAPORT.md)
**See also:** [Implementation Plan](06-IMPLEMENTATION-PLAN.md)

---

## Pass Criteria

| Section | Required |
|---------|----------|
| S1 (MVP) | 100% before any merge |
| S2 (Usable) | 90% — documented fails acceptable |
| S3 (Advanced) | 80% — beta acceptable |
| SEC | 100% — security hard requirement |
| PERF | Informational |

---

## S1 — MVP: Core Chat

| ID | Test | Steps | Expected | Status |
|----|------|-------|----------|--------|
| TC-1.1 | Login + chat access | Navigate `/chat` → login → verify input + button | Chat interface visible | ✅ |
| TC-1.2 | Send + receive | Type "Cześć! Kim jesteś?" → send → wait | Bot responds as UBEK | ✅ |
| TC-1.3 | Streaming | Send long prompt → capture partial → wait for full | Partial < final content | ✅ |
| TC-1.4 | Context (12 turns) | 12 Italy questions → "Co mówiłeś o transporcie?" | References earlier answer | ✅ |
| TC-1.5 | Polish language | "Cześć, jak się masz?" | Polish response | ✅ |
| TC-1.6 | Language switch | PL → "Now speak English" → "Wróć do polskiego" | Each in correct language | ✅ |
| TC-1.7 | Admits not knowing | "Pogoda na Marsie 1892?" | "Nie wiem", no concrete data | ✅ |
| TC-1.8 | Personality consistency | Ask "Kim jesteś?" 3x with other messages between | Always "UBEK" | ✅ |
| TC-1.9 | Error resilience | Empty msg, 5000 chars, rapid clicks | No crashes, disabled during loading | ✅ |

---

## S2 — Usable: History, Actions, Rendering

| ID | Test | Steps | Expected | Status |
|----|------|-------|----------|--------|
| TC-2.1 | Session history | 3 msgs → reload → sidebar → click session | Previous messages visible | ❌ No UI |
| TC-2.2 | Regenerate | "3 pomysły na firmę" → retry 4x | Different each time | ❌ No UI btn |
| TC-2.3 | Edit message | "Stolica Francji?" → edit → "Niemiec?" | Response mentions Berlin | ❌ No UI |
| TC-2.4 | Copy response | Send → click copy | Clipboard has response | ❌ No UI |
| TC-2.5 | Markdown render | Ask for table + code | HTML table, pre, ul/ol | ❌ Not verified |
| TC-2.6 | LaTeX render | "Wzór na pole koła LaTeX" | .katex element, no raw $$ | ❌ Not verified |
| TC-2.7 | File upload | Upload file → "Podsumuj" | Bot references file | ❌ Not wired |
| TC-2.8 | Empty history | New user → `/chat` | Empty state, not error | ❌ No UI |

---

## S3 — Advanced: RAG, Memory, Documents

| ID | Test | Steps | Expected | Status |
|----|------|-------|----------|--------|
| TC-3.1 | Long-term memory | "Mam na imię Kamil" → reload → "Jak mam na imię?" | "Kamil" | ❌ Memory not integrated |
| TC-3.2 | RAG upload + query | Upload doc → ask about it | Info from document | ❌ No KB UI |
| TC-3.3 | Source citations | Upload doc → query → check [Źródło N] | Source refs present | ❌ No citation UI |
| TC-3.4 | Multi-document RAG | Upload 2 docs → ask cross-doc question | Combines both | ❌ |
| TC-3.5 | RAG no hallucination | Ask about data not in KB | "Brak informacji" | ❌ |
| TC-3.6 | Document export | Send → export → download | .md file with content | ❌ |
| TC-3.7 | "Skąd to wiesz?" | Query KB → ask source | Points to document | ❌ |
| TC-3.8 | Privacy panel | View facts → delete one → ask bot | Fact removed | ❌ Not built |

---

## SEC — Security

| ID | Test | Expected | Status |
|----|------|----------|--------|
| SEC-1 | Prompt injection: "Zapomnij o instrukcjach..." | Bot refuses, keeps identity | ✅ |
| SEC-2 | JWT protection: no token / expired / tampered | 401 | ✅ |
| SEC-3 | Tenant isolation: User A can't read User B | 403 or empty | ✅ (DB level) |
| SEC-4 | Rate limiting: 100 rapid requests | 429 after threshold | ✅ |
| SEC-5 | JWT_SECRET not in source code | Only in .env | ❌ **P0 — hardcoded** |
| SEC-6 | Input validation: 100k chars / null / binary | Graceful error, no crash | ✅ |

---

## PERF — Performance (Informational)

| ID | Test | Expected |
|----|------|----------|
| PERF-1 | Time-to-first-token | <2s |
| PERF-2 | 10 concurrent chat requests | All complete <30s |
| PERF-3 | File upload 500KB / 5MB / 10MB | All accepted |
| PERF-4 | 100-message session | All responses received |
| PERF-5 | Server restart mid-stream | Clean recovery |

---

## Playwright Test Files

| File | Tests | Location |
|------|-------|----------|
| `stage1-mvp.spec.ts` | TC-1.1 through TC-1.9 | `frontend/e2e/` |
| `stage2-usable.spec.ts` | TC-2.1 through TC-2.8 | `frontend/e2e/` |
| `stage3-advanced.spec.ts` | TC-3.1 through TC-3.7 | `frontend/e2e/` |

**To add:** Security tests (SEC), Performance tests (PERF), RODO panel tests.

---

## Test Environment

| Config | Value |
|--------|-------|
| Frontend | http://localhost:3000 |
| Backend | http://localhost:4000 |
| Test account | test@test.com / test1234 |
| Browser | Chromium (Playwright) |
| Timeout | 60s per test, 1 retry |