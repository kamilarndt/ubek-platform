# UBEK — Architecture Decision Records Index

**Status:** Active · **Version:** 1.0 · **Updated:** 2026-05-29
**See:** [ARCHITECTURE](02-ARCHITECTURE.md) Section 8

---

## Active ADRs

| ID | Title | Status | Location |
|----|-------|--------|----------|
| 001 | No Default Tools in Server — `tools: []` | ⚠️ Superseded | `server/docs/adrs/ADR-001-*.md` |
| 002 | In-Memory Sessions Only | ❌ **WITHDRAWN** | `server/docs/adrs/ADR-002-*.md` |
| 003 | SDK Adapter with Explicit SSE Schema | ✅ Adopted | `server/docs/adrs/ADR-003-*.md` |
| 004 | Per-Tenant AgentSession Isolation | ✅ Adopted | `server/docs/adrs/ADR-004-*.md` |
| 005 | Disabled Auto-Retry in Chat | ✅ Adopted | `server/docs/adrs/ADR-005-*.md` |
| 006 | Feature Flags for Phased Rollout | 📋 Proposed | `server/docs/adrs/ADR-006-*.md` |
| 007 | Default Tools for Every Pi Agent | ✅ Adopted |
| 011 | Data-Driven Facade Architecture (Phase 1) | ✅ Adopted |
| 012 | Full Session Persistence (replaces ADR-002) | ✅ Adopted |


## Active Decisions (No Formal ADR)

| Decision | Rationale | Status |
| ADR-008 | Admin Dashboard - agent monitor, builder, deploy pipeline | Proposed | server/docs/adrs/ADR-008-*.md |
| ADR-009 | Per-User Personality - admin-configurable, neutral default | Proposed | server/docs/adrs/ADR-009-*.md |
| ADR-010 | Per-User Dynamic UI - sidebar/tabs zaleza od extensionow | Proposed | server/docs/adrs/ADR-010-*.md |
|----------|-----------|--------|
| SSE over WebSocket | Simpler, HTTP/2, no extra infra | ✅ Active |
| Router LLM as only provider | Cost control, abstraction | ✅ Enforced |
| PiAgentService through SDK (future) | Architecture Vision requirement | 📋 Accepted |
| No Voice/VAD in Faza 1 | Infrastructure-heavy, low value | ✅ Active |

---

## ADR Template

```markdown
# ADR-NNN: Short Title

## Status
Proposed | Accepted | Deprecated | Superseded

## Context
Why this decision is needed. What alternatives exist?

## Decision
What we decided. Include code/config examples.

## Consequences
What becomes easier, harder, or is traded off.

## Related
Links to other ADRs or docs.
```