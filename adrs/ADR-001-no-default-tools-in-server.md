# ADR-001: No Default Tools in Server Context

## Status
**SUPERSEDED** (2026-06-02)

## Context

The Pi Agent SDK (`@earendil-works/pi-coding-agent` v0.75.5) ships with a set of default built-in tools:

| Tool   | Capability                          | Risk in server context               |
|--------|-------------------------------------|---------------------------------------|
| `read` | Read any file from filesystem       | Unauthorised data access              |
| `bash` | Execute arbitrary shell commands    | Full remote code execution (RCE)      |
| `edit` | Modify file contents                | Unauthorised data tampering           |
| `write`| Write new files                     | Unauthorised data creation/injection  |

When `createAgentSession()` is called **without an explicit `tools` array**, the SDK activates all four default tools. The SDK type definitions confirm this behaviour:

```typescript
// Default when tools is omitted:
// read, bash, edit, write — ALL enabled
```

In a **CLI context** (the SDK's original design target), this is intentional — the agent needs filesystem access to be useful. But ubek is a **multi-tenant HTTP server**. Enabling these tools means any tenant's LLM prompt could:

1. Read `/etc/passwd`, database credentials, or other tenants' data
2. Execute `rm -rf /` or install malware via bash
3. Modify server-side application code
4. Write arbitrary files to the server filesystem

The current `PiAgentService.ts` does **not use the SDK at all** — it calls the Router LLM directly via `fetch()` with a hardcoded system prompt and no tool access. The migration to the SDK is the moment we must decide what tools, if any, the server exposes.

### Constraints

- ubek currently has **no notion of tools** — the chat endpoint sends plain text messages to the LLM
- The frontend SSE protocol (`{type: "status"|"text"|"done"}`) has no tool-call or tool-result schema
- Tools are a new capability that must be **opt-in by design**, not a side-effect of SDK defaults
- The `tools` option on `createAgentSession()` already supports suppression via both `tools: []` (empty allowlist) and `noTools: "all"` (suppression flag)

## Options Considered

### Option A — Disable all tools, require explicit opt-in for any tool

Pass `tools: []` to `createAgentSession()`, suppressing all built-in tools. Any future tool must be explicitly registered via `customTools` with a security review.

- **Pros:**
  - Maximum security by default — no accidental filesystem exposure
  - Forces explicit security review for each new tool
  - Aligns with principle of least privilege
  - SDK supports this natively (`tools: []` is a documented option)
- **Cons:**
  - Ubek's chat currently has no tools anyway, so this changes nothing functionally
  - When tools are needed later, requires an ADR and explicit registration

### Option B — Restricted allowlist (e.g., `read` only)

Enable a subset of built-in tools deemed "safe enough" — e.g., `read` for context retrieval but not `bash`/`edit`/`write`.

- **Pros:**
  - Some agent capability beyond plain text chat
  - Familiar to CLI-agent users
- **Cons:**
  - `read` still exposes arbitrary file read — dangerous in multi-tenant server
  - Creates a false sense of security ("we only enabled read")
  - Still requires tool-call schema in SSE protocol, which doesn't exist yet
  - Partial adoption creates migration pain when full tools eventually land

### Option C — Custom server-safe tools

Replace built-in tools with custom implementations that are sandboxed (e.g., scoped to a tenant directory, injected DB queries instead of file reads).

- **Pros:**
  - Maximum alignment with server context
  - Tools can be tenant-aware and auditable
- **Cons:**
  - High upfront investment to design, implement, and test custom tools
  - Ubek currently has no tool-using features — building tools for a capability that doesn't exist yet is premature
  - SSE protocol lacks tool-call schema — would need ADR-003 first

## Decision

**Adopt Option A: `tools: []` — disable all tools, require explicit opt-in.**

```typescript
const { session } = await createAgentSession({
  tools: [],           // No built-in tools
  sessionManager: ...,  // See ADR-002
  model: ...,           // See ADR-004 for per-tenant model config
});
```

This means the SDK AgentSession will operate in **text-only mode** — the LLM receives no tool definitions, cannot call tools, and only produces text responses. This is identical to the current `PiAgentService.ts` behaviour (which calls Router with a plain system prompt + messages, no tools).

Additionally, set `noTools: "all"` as a defensive guard in case a future SDK version changes the default behaviour:

```typescript
const { session } = await createAgentSession({
  noTools: "all",      // Defensive: suppress even if defaults change
  tools: [],           // Explicit empty allowlist
  ...
});
```

## Consequences

### Easier
- **Security**: Zero filesystem exposure from SDK defaults. No RCE vector via bash tool.
- **Migration**: Current behaviour (text-only chat) is preserved. The SDK path produces the same UX as the current `fetch()` path.
- **Reversibility**: Adding tools later is easy — register a `customTool` and extend the SSE schema. No removal needed.

### Harder
- **No agent autonomy**: Without tools, the agent cannot read files, execute commands, or interact with the system. This is acceptable because ubek's current chat doesn't support this anyway.
- **Future tool adoption requires SSE schema change**: Before any tool can be used, the frontend SSE protocol must support tool-call events (see ADR-003). This is a deliberate ordering — schema first, tools second.
- **Misalignment with SDK defaults**: We're fighting the SDK's default configuration. The `noTools: "all"` guard is a safe net against upstream changes.

### Trade-off
Security over capability. We choose to ship with _less_ agent capability than the SDK offers by default, because the server context is fundamentally different from the CLI context. The cost is that when tools are eventually needed, there's more work to do (SSE schema + tool registration). But that work would be required anyway for safe tool usage.

## Status

**SUPERSEDED** (2026-06-02)

Decyzja o  została odwrócona. Zobacz [[docs/05-ADR-INDEX.md]] wpis o Default Tools.

**Powód odwrotu:** UBEK wymaga standardowych narzędzi AI dla każdego nowego Pi Agenta, odpowiadających funkcjom BigTech chatbotów (ChatGPT, Claude, Gemini, Grok). Każdy nowy użytkownik otrzymuje agenta z zestawem Default Tools (vision, file upload, document generation, web search, memory). Bezpieczeństwo jest zapewnione przez sandboxing na poziomie extensiionów, a nie przez wyłączenie wszystkich narzędzi.

Zobacz: 
- [[docs/CONTEXT.md]] - definicja Default Tools
- [[server/docs/ARCHITECTURE-VISION.md]] - zaktualizowana architektura


## Superseded by

**Decyzja odwrocona (2026-06-02).** UBEK wymaga standardowych narzedzi AI dla kazdego nowego Pi Agenta, odpowiadajacych funkcjom BigTech chatbotow (ChatGPT, Claude, Gemini, Grok). Kazdy nowy uzytkownik otrzymuje agenta z zestawem Default Tools:

- **Vision** - odczytywanie zdjec, screenshotow, diagramow
- **File Upload & Analysis** - przetwarzanie PDF, obrazow, dokumentow
- **Document Generation** - generowanie raportow, umow, cennikow
- **Web Search** - przeszukiwanie internetu
- **Memory** - zapis/odczyt pamieci dlugoterminowej (UBEK :18765)

Bezpieczenstwo jest zapewnione przez sandboxing na poziomie extensionow (nie przez wylaczenie wszystkich narzedzi). Kazdy tool jest osobnym extensionem z wlasna walidacja i ograniczeniami.

**Zobacz:**
- [docs/CONTEXT.md] - definicja Default Tools
- [docs/05-ADR-INDEX.md] - ADR-007
- [server/docs/ARCHITECTURE-VISION.md] - zaktualizowana architektura