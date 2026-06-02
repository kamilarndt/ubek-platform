# ADR-005: Disabled Auto-Retry in Chat Endpoints

## Status
Proposed

## Context

The Pi Agent SDK has **auto-retry enabled by default**. From the SDK source (`SettingsManager`):

```typescript
// Default retry settings (from SDK settings manager)
{
  enabled: true,
  maxRetries: 3,
  // ... delay calculated internally
}
```

When the SDK's auto-retry triggers, the following happens internally:

1. The LLM call fails (rate limit, timeout, server error)
2. The SDK catches the error internally
3. It emits an `auto_retry_start` event: `{ type: "auto_retry_start", attempt, maxAttempts, delayMs, errorMessage }`
4. It waits for `delayMs` (backoff)
5. It retries the LLM call automatically
6. On success, emits `auto_retry_end: { success: true, attempt }`
7. On all retries exhausted, emits `auto_retry_end: { success: false, finalError }` and the `agent_end` event

During this entire retry cycle, **the `session.prompt()` call does not resolve**. The adapter (ADR-003) receives no `text_delta` events — only silence punctuated by `auto_retry_start` events.

### The problem

In a chat UI, silence is terrible UX:

- The user sees the "Agent thinking..." status, then nothing happens for 10-60 seconds
- There's no indication that the system is retrying
- The user may refresh the page, send another message (causing race conditions), or assume the system is broken
- SDK auto-retry is designed for CLI usage where the user sees terminal output showing retry progress

### The retry scenario

SDK auto-retry is designed for transient LLM API failures:
- Rate limits (HTTP 429)
- Temporary server errors (HTTP 500, 502, 503)
- Network timeouts

These happen in ubek's current architecture too — `PiAgentService.ts` has a 45-second timeout (`AbortController` with 45s timeout). But currently the error is returned to the user immediately:

```typescript
// Current code: error → immediate user feedback
callbacks.onError(new Error("Przepraszam, przekroczono limit czasu."));
```

### Constraints

- SDK auto-retry is **not configurable via `createAgentSession()` options** — it's controlled by `SettingsManager` which reads from config files (~/.pi/agent/settings.json)
- The `SettingsManager` can be configured programmatically, but it's not exposed in the `CreateAgentSessionOptions` interface
- `session.prompt()` blocks until the entire retry cycle completes or exhausts
- We need to either: disable SDK retry entirely, or make retry visible to the user

## Options Considered

### Option A — Disable SDK auto-retry, implement ubek-level lightweight retry

Set `settingsManager` to disable retry at the SDK level, then implement a lightweight retry in the ubek adapter that:
1. Retries only once (not 3 times)
2. Sends a status update to the user: `{ type: "status", status: "⏳ Retrying... (attempt 2/2)" }`
3. Has a short timeout (5s per retry, not 30s+)
4. Returns a user-friendly error if retry fails

```typescript
// Disable SDK retry
import { SettingsManager } from "@earendil-works/pi-coding-agent";

const settingsManager = SettingsManager.create(cwd, agentDir);
const retrySettings = settingsManager.getRetrySettings();
retrySettings.enabled = false;  // Disable SDK auto-retry
settingsManager.setRetrySettings(retrySettings);
```

- **Pros:**
  - User sees retry progress — no silent waiting
  - One retry (not three) — fail fast, recover fast
  - Ubek-level retry can be customised per-endpoint (chat vs vision)
  - Short timeouts mean the user waits less
- **Cons:**
  - SDK `SettingsManager` API for disabling retry is indirect — mutating the settings object
  - Slightly more code in the adapter
  - One retry is less resilient than three (but more appropriate for interactive chat)

### Option B — Keep SDK auto-retry, surface events to frontend

Keep SDK auto-retry enabled, and extend the adapter to map `auto_retry_start`/`auto_retry_end` events to SSE status messages that the frontend can display.

- **Pros:**
  - Full SDK retry resilience (3 attempts with exponential backoff)
  - User sees retry progress via status events
- **Cons:**
  - Requires frontend changes to display retry status (or can be mapped to existing `{type: "status"}`)
  - SDK retry delays can be very long (exponential backoff: 5s, 15s, 45s+)
  - 3 retries × long backoffs = user waits 60+ seconds for a response
  - SDK retry logic is opaque — we can't control delays or conditions
  - The `settingsManager.getRetrySettings()` API exists but mutating it to _reduce_ retries is fighting the SDK

### Option C — Conservative SDK limits without disabling

Keep SDK retry enabled but configure conservative limits: reduce `maxRetries` to 1, set short delays.

- **Pros:**
  - Uses SDK's built-in retry mechanism (less custom code)
  - Some resilience without long waits
- **Cons:**
  - `SettingsManager.setRetrySettings()` mutates SDK state — fragile
  - Still blocks `session.prompt()` during retry — no ability to send mid-retry status updates
  - SDK retry emits `auto_retry_start` but we can't control the delay calculation
  - Most complex option combined with the least benefit

## Decision

**Adopt Option A: Disable SDK auto-retry, implement lightweight ubek-level retry with user visibility.**

```typescript
// In adapter setup:
const settingsManager = SettingsManager.create(cwd, agentDir);
const retrySettings = settingsManager.getRetrySettings();
retrySettings.enabled = false;
settingsManager.setRetrySettings(retrySettings);

// In adapter streaming:
const MAX_RETRIES = 1;  // One retry is enough for transient errors
const RETRY_TIMEOUT_MS = 5000;

async function streamWithRetry(tenantId, messages, res) {
  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
    try {
      const session = await getOrCreateSession(tenantId, model);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), RETRY_TIMEOUT_MS);
      
      await session.prompt(userMessage);
      
      clearTimeout(timeout);
      return;  // Success
    } catch (err) {
      if (attempt <= MAX_RETRIES && isTransientError(err)) {
        sendSSEStatus(res, `⏳ Retrying... (attempt ${attempt + 1}/${MAX_RETRIES + 1})`);
        continue;
      }
      // Surface error to user
      sendSSEStatus(res, `Error: ${err.message}`);
      res.end();
      return;
    }
  }
}
```

### What counts as a transient error

Only retry on:
- `AbortError` (timeout) — the LLM provider took too long
- Network errors (fetch failed, connection reset)
- HTTP 429 (rate limited) — with a note that the user may need to wait
- HTTP 5xx (server errors)

Do NOT retry on:
- HTTP 4xx (auth errors, bad requests) — these are permanent
- Zod validation errors — these are programming mistakes
- Model not found / API key not configured — these are configuration issues

### Why one retry?

1. **Chat UX requires fast feedback**: 5s timeout + 5s retry = 10s max wait. Three retries with backoff could take 60s+.
2. **Transient errors are usually resolved in seconds**: A single retry catches the vast majority of transient failures.
3. **The user can always retry manually**: If both attempts fail, the user sees the error immediately and can try again.

## Consequences

### Easier
- **User visibility**: Status events show retry progress. No silent waiting.
- **Fast failure**: Max 10s wait (5s initial + 5s retry) instead of 60s+ with SDK exponential backoff.
- **Controllable**: Retry policy is in ubek code, not buried in SDK settings.
- **Appropriate defaults**: Chat is interactive — retry should be fast and visible, not silent and slow.

### Harder
- **SDK integration quirk**: Disabling SDK retry requires reaching into `SettingsManager` and mutating a settings object. This is not a first-class `createAgentSession()` option.
- **Two retry systems**: If we ever enable SDK tools (future), the SDK's retry logic for tool calls would still be active unless explicitly disabled there too.
- **Less resilience**: One retry catches fewer failures than three. Acceptable trade-off for interactive chat.

### Trade-off
Responsiveness over resilience. In interactive chat, a 10-second wait with visible retry status is better UX than a 60-second silent retry. Users can re-prompt if both attempts fail.

For **non-interactive endpoints** (webhooks, batch processing), we might want Option B (full SDK retry) — but that's a future concern.