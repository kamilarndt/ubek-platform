# PRD: UBEK — Agent-as-a-Service Platform

**Status:** Active · **Version:** 1.0 · **Updated:** 2026-05-29
**Source of Truth:** This document + [ARCHITECTURE](02-ARCHITECTURE.md)

---

## 1. Executive Summary

UBEK to platforma która sprzedaje inteligencję AI małym firmom jako usługę. Każdy użytkownik dostaje własnego, personalizowanego agenta AI który rozwija się razem z nim — użytkownik zamawia funkcje przez rozmowę, agent je buduje jako rozszerzenia (Pi Extensions).

**Faza 1 (obecnie):** Twarda walidacja rynkowa -- max 20 uzytkownikow, architektoniczna fasada (Data-Driven Configuration), jeden VPS. Wyznacznik sukcesu: retencja + gotowosc do placenia.
**Faza 2 (po walidacji):** Skalowalna architektura, Core-and-Extension Marketplace, Docker/K8s, wlasny silnik AI.

**Strategia:** Facade first -> Validate -> Core-and-Extension

## 2. Problem Statement

| Problem | Kogo dotyczy | Konsekwencje |
|---------|-------------|--------------|
| Małe firmy nie stać na custom AI | Właściciele firm 1-20 osób | Konkurencyjnie gorsi od korporacji |
| Narzędzia AI są zbyt generyczne | Freelancerzy, solopreneurs | Godziny prompt engineeringu zamiast pracy |
| Wdrożenie AI wymaga technical know-how | Przedsiębiorcy bez backgroundu IT | Paraliż decyzyjny, odkładanie decyzji |
| Lock-in w duże platformy (OpenAI, Anthropic) | Każdy kto zaczął używać AI | Brak kontroli nad kosztami i danymi |

**UBEK rozwiązuje to przez:** Jeden czat → agent który uczy się twojej firmy → rozszerza się na twoje żądanie → jest twój i tylko twój.

---

## 3. Target Audience

### Persona A: Solopreneur / Freelancer (primary)
- **Profil:** Właściciel jednoosobowej działalności (scenograf, copywriter, programista)
- **Needs:** Automatyzacja powtarzalnych zadań, research, generowanie treści
- **Pain:** Nie ma czasu na setup narzędzi AI, potrzebuje "to działa od razu"
- **Tech level:** Niski-średni

### Persona B: Mała firma (1-20 osób)
- **Profil:** Agencja eventowa, sklep online, studio projektowe
- **Needs:** Wiedza firmowa w jednym miejscu, automatyzacja obsługi klienta
- **Pain:** Rozproszona wiedza w emailach, dokumentach, głowach pracowników
- **Tech level:** Średni

### Persona C: Deweloper budujący na UBEK
- **Profil:** Ktoś kto chce dodać AI do swojego produktu
- **Needs:** API, webhooki, możliwość embedowania agenta
- **Pain:** Budgetowanie kosztów LLM, skalowanie
- **Tech level:** Wysoki

---

## 4. Product Vision

> **Każdy użytkownik ma własnego Pi Agenta który rozwija się razem z nim.**

To nie jest chatbot z fixed feature setem. To żywy system:

1. **Rozmawiasz** z agentem jak z asystentem
2. **Mówisz czego potrzebujesz** → agent rozumie intencję
3. **Agent buduje rozszerzenie** (Pi Extension) które realizuje tę funkcję
4. **Rozszerzenie zostaje** → twój agent staje się lepszy
5. **Z czasem agent ewoluuje** w personalne centrum zarządzania twoją firmą


### Architekturalna Fasada (Phase 1)

Kazdy tenant na starcie sprawia wrazenie posiadania pelnych funkcjonalnosci premium (Big-Tech). Pod maska realizacja opiera sie na **Data-Driven Configuration**:
- Wrazenie personalizacji = podminana system_prompt + kontekst tekstowy per sesja (SQL)
- Sub-agenci = osobne watki z dedykowanym promptem i przypisanym kontekstem plikow
- Bazy wiedzy = wstrzykniecie sparsowanego tekstu/obrazow (Base64) bezposrednio w okno kontekstowe Router LLM
- 90% pracy obliczeniowej (OCR, ekstrakcja) zrzucone na zewnetrzne modele przez Router
- Zadnego over-engineeringu - wszystko jest rekordem w PostgreSQL + promptem dynamicznym
---

## 4a. Extension Lifecycle - Data-Driven (Phase 1)

> **User nie buduje extensionow - my konfigurujemy.**

Mechanizm dystrybucji modulow w Fazie 1 jest statyczny (manualny): Administrator modyfikuje obiekty konfiguracyjne JSON w bazie danych i mapuje parametry. Zadnego automatycznego marketplace w kodzie.

1. User mowi Potrzebuje X -> agent zapamietuje potrzebe
2. Potrzeba trafia do Admin Dashboard jako zgloszenie
3. Admin tworzy nowy rekord konfiguracyjny (JSON w DB) - definiuje system_prompt, dostepne narzedzia, kontekst domyslny
4. Admin przypisuje tenantowi nowy modul przez zmiane flagi/parametru w bazie
5. Przy nastepnej sesji agent uzywa nowej konfiguracji
6. User widzi nowa zakladke w sidebarze (dynamiczny UI z konfiguracji)
7. Serializacja i replikacja modulu do innego tenanta = skopiowanie rekordu JSON + podminana tenant_id

### Core-and-Extension Marketplace (Phase 2 - docelowe)

Globalny rdzen wtyczki (Extensions) bedzie odizolowany od specyficznych nadpisan klienta (Extension_Overrides w DB) przez Dependency Injection / Hooks. Model ten pozwoli na bezkosztowe replikowanie modulow miedzy tenantami z automatycznym mergem konfiguracji
---

## 5. Features by Priority

### P0 — Ship It (Current)
| ID | Feature | Status |
|----|---------|--------|
| F-01 | Chat z SSE streamingiem | ✅ Działa |
| F-02 | Auth (JWT) + guardrails | ✅ Działa |
| F-03 | System prompt + osobowość UBEK | ✅ Działa |
| F-04 | Obsługa języka PL/EN | ✅ Działa |
| F-05 | Guardrails (injection, rate limit, audit) | ✅ Działa |
| F-06 | Frontend UI (Next.js) | ✅ Naprawiony |
| F-07 | Vault (upload, foldery, preview) | ✅ Działa |

### P1 — Next Iteration
| ID | Feature | Test | Effort |
|----|---------|------|--------|
| F-08 | JWT_SECRET do .env | SEC-5 | 15min |
| F-09 | Historia rozmów (sidebar + UI) | TC-2.1 | 2d |
| F-10 | Regenerate + Copy actions | TC-2.2, TC-2.4 | 1d |
| F-11 | Memory API integracja z backendem | TC-3.1 | 2d |
| F-12 | Observability panel (tokeny, koszty) | — | 1d |
| F-33 | Dynamic Per-User Sidebar — zakladki z extensionow usera | TC-2.9 | 2d |
| F-30 | Admin Dashboard — agent monitor, error logs, kontrola zachowan | TC-5.1 | 4d |
| F-34 | Per-User Personality — admin konfiguruje jak agent mowi | — | 2d |

### P2 — Product Polish
| ID | Feature | Test | Effort |
|----|---------|------|--------|
| F-13 | Edit message | TC-2.3 | 1d |
| F-14 | Markdown rendering (react-markdown) | TC-2.5 | 1d |
| F-15 | LaTeX rendering (rehype-katex) | TC-2.6 | 0.5d |
| F-16 | File upload w czacie (Drag & Drop) | TC-2.7 | 2d |
| F-17 | Knowledge Bases UI manager | TC-3.2 | 3d |
| F-18 | Privacy panel "Co bot o mnie wie" | TC-3.8 | 1d |
| F-19 | Source citations rendering | TC-3.3, TC-3.7 | 1d |
| F-31 | Extension Builder - admin tworzy/testuje/wdraza extensiony | - | 5d |
| F-32 | Extension Request Queue - zgloszenia userow w dashboardzie | TC-5.2 | 3d |
| F-20 | Document export (PDF/MD/DOCX) | TC-3.6 | 2d |
| F-21 | Vault separacja KB / Document Storage | — | 3d |

### P3 — Agent Features
| ID | Feature | Effort |
|----|---------|--------|
| F-22 | Function Calling (Web Search, Kalkulator) | 3d |
| F-23 | Agentic Loop (dekompozycja + plan) | 5d |
| F-24 | Async Tasks z powiadomieniami | 5d |
| F-25 | Human-in-the-loop | 3d |

### P4 — Future
| ID | Feature |
|----|---------|
| F-26 | Voice (STT/TTS) |
| F-27 | Multi-agent przez A2A |
| F-28 | Pi Extensions marketplace |
| F-29 | Deploy PM2 + Nginx na VPS |

---

## 6. Success Metrics (Faza 1)

| Metric | Goal | How |
|--------|------|-----|
| Retencja miesieczna | >=80% po 30 dniach | Session logs |
| Gotowosc do placenia | >=50% trial -> paid po 14 dniach | Subscriptions |
| Conversations/user/day | >=3 | Session logs |
| Time-to-first-token | <2s | SSE latency |
| Uptime | 99.5% | Health check |
| LLM cost/user/month | <=EUR50 | Token counting |

---

## 7. Non-Goals (Faza 1)

| Element | Why |
|---------|-----|
| Mobile native apps | PWA later |
| Voice/VAD | Infrastructure-heavy |
| Multi-language beyond PL/EN | No demand signal |
| Multi-agent orchestration in product | Exists in A2A ecosystem |
| Custom model training | Cost-prohibitive |
| SOC2 / enterprise compliance | Overkill for 20 users |

---

## 8. Constraints

| Constraint | Detail |
|------------|--------|
| Infrastructure | 1 Contabo VPS (6 vCPU, 11GB RAM, €8.61/mo) |
| LLM provider | **Router LLM (:18881) — JEDYNY** |
| Database | PostgreSQL 16 + pgvector |
| Max users Faza 1 | 20 |
| Budget LLM | Max €50/mo (free-first chain) |

---

## 9. Related Documents

[02-ARCHITECTURE.md](02-ARCHITECTURE.md) · [03-USER-WORKFLOWS.md](03-USER-WORKFLOWS.md) · [04-TEST-CHECKLIST.md](04-TEST-CHECKLIST.md) · [05-ADR-INDEX.md](05-ADR-INDEX.md) · [06-IMPLEMENTATION-PLAN.md](06-IMPLEMENTATION-PLAN.md)