---
title: "UBEK — Architecture Vision"
type: architecture
created: 2026-05-25
updated: 2026-05-27
tags: [ubek, architecture, vision, adr]
status: vision
summary: "Docelowa architektura UBEK — pełna wizja po walidacji rynku (FAZA 2). FAZA 1 używa uproszczonego stacku: Express + Router LLM na jednym VPS."
language: pl
---

# UBEK — Architecture Vision

> **Status: VISION** — Ten dokument opisuje stan docelowy (FAZA 2).
> Obecna implementacja (FAZA 1) jest uproszczeniem — patrz: kod źródłowy i [[PLAN-IMPLEMENTACJI]].

## Założenia architektoniczne (FAZA 2)

1. **Każdy użytkownik = 1 Pi Agent** z własną pamięcią (pgvector), extensionami i system promptem
2. **Backend jest cienkim bridge'm** — uwierzytelnia, routuje, loguje. Nie ma własnej logiki AI.
3. **Router LLM (:18881)** — warstwa abstrakcji nad modelami. Backend woła TYLKO Router, nigdy modele bezpośrednio.
4. **Tenant isolation** — dane użytkowników są w pełni izolowane (WHERE tenant_id = ? na każdym zapytaniu)
5. **Event-driven** — komunikacja asynchroniczna przez kolejkę (FAZA 2)

## Stack docelowy (FAZA 2)

| Warstwa | Technologia |
|---------|------------|
| **Frontend** | Next.js 15 + React 19 + Tailwind v4 |
| **Backend API** | Express TypeScript (:4000) |
| **LLM Gateway** | Router LLM (:18881) — 787 modeli, free-first routing |
| **Baza główna** | PostgreSQL 16 + pgvector |
| **Cache / Queue** | Redis (Bull queue) |
| **Deployment** | Docker / Kubernetes |
| **Monitoring** | OpenTelemetry + Prometheus + Grafana |
| **Backup** | pg_dump → Backblaze B2 |

## ADR-y

- [[architecture/ADR-001-api-client-layer]] — Axios + interceptory dla frontendu
- [[architecture/ADR-002-integration-pattern]] — Wzorzec integracji backend ↔ agent
- [[ADR-002-guardrails-global]] — System guardrails (InjectionDetector, RateLimiter, AuditLogger)

## Powiązane dokumenty

- [[PLAN-IMPLEMENTACJI]] — Plan wdrożenia FAZY 1
- [[CONTEXT]] — Słownik pojęć i kontekst domenowy
- [[ANALIZA-SWARM-KOMPLETNA]] — Analiza ryzyk i priorytetów