# ADR-011: Data-Driven Facade Architecture (Phase 1)

## Status
**Adopted** (2026-06-02)

## Context

Phase 1 requires rapid validation with up to 20 users. Building full infrastructure (RAG pipeline, vector search, agentic loops) before validating demand is over-engineering. However, every tenant must appear to have premium Big-Tech functionality from day one.

The gap between "appears premium" and "is premium" must be bridged by architecture, not marketing.

## Decision

Phase 1 implements an **architectural facade** — data-driven configuration layer over minimal infrastructure:

1. **Personalization**: Global `system_prompt` + per-session context override stored in PostgreSQL. No ML profiling.
2. **Sub-agents**: Separate SQL session records with custom `system_prompt`, `context_text`, `tool_mapping`. No A2A or multi-agent infrastructure.
3. **Knowledge Bases**: Parsed file text + Base64 images injected directly into LLM context window via Router LLM. No dedicated RAG pipeline.
4. **OCR/Extraction**: 90% of compute offloaded to Router LLM models. No dedicated OCR service.
5. **Module Distribution**: Static JSON config objects in DB + tenant_id parameter mapping. No automated marketplace.

### Phase 2 Target (documented for future)

When Phase 1 validates demand, these facades are replaced with real implementations:
- Core-and-Extension Marketplace (Dependency Injection / Hooks)
- Dedicated OCR/vector/RAG pipelines
- True multi-agent A2A infrastructure
- Extension_Overrides table in DB for client-specific customizations

## Consequences

**Easier:**
- Time-to-market: weeks instead of months
- Cost: minimal infrastructure spend before demand validation
- Flexibility: changes are SQL updates, not deploys
- Learning: real user feedback shapes Phase 2 architecture

**Harder:**
- Context window limits constrain document size (mitigation: chunking + truncation)
- No true persistence between sessions beyond DB records
- Phase 2 will require migration from facade to real infrastructure

## Related

- ADR-012: Full Session Persistence (replaces ADR-002)
- ADR-001: Superseded — tools now enabled