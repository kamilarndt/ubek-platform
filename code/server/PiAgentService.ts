/**
 * PiAgentService — Bridge between Ubek Backend and LLM via Router
 *
 * Calls Router LLM (:18881) for all LLM operations.
 * Router handles: model routing, fallback chains, rate limiting.
 *
 * This replaces the Pi Agent SDK approach (which required OPENCODE_API_KEY).
 * The Router has the API key and handles auth/model selection.
 */

import { readFileSync } from "fs";

export interface StreamCallbacks {
  onToken: (token: string) => void;
  onStatus: (status: string) => void;
  onDone: () => void;
  onError: (error: Error) => void;
}

const ROUTER_URL = process.env.ROUTER_URL || "http://localhost:18881";

function getRouterApiKey(): string {
  // Check env first (ROUTER_API_KEY in .env)
  if (process.env.ROUTER_API_KEY) return process.env.ROUTER_API_KEY;
  // Fallback: Pi agent auth.json
  try {
    const authPath = (process.env.HOME || "/home/kamil") + "/.pi/agent/auth.json";
    const auth = JSON.parse(readFileSync(authPath, "utf-8"));
    return auth.router?.apiKey || "";
  } catch {
    return "";
  }
}

const UBEK_SYSTEM = "Jesteś asystentem UBEK — platformy inteligencji AI. "
  + "Jesteś pomocny, rzeczowy i naturalny w komunikacji.\n\n"
  + "ZASADY:\n"
  + "1. JĘZYK: Zawsze odpowiadaj w tym samym języku, w którym użytkownik zadał pytanie.\n"
  + "2. NIE WIEM: Jeśli nie znasz odpowiedzi, przyznaj się. Nie wymyślaj faktów.\n"
  + "3. OSOBOWOŚĆ: Jesteś inteligentnym, naturalnym asystentem. Unikaj fraz 'Jako model językowy...'.\n"
  + "4. KONTEKST: Uważnie śledź całą rozmowę. Nawiązuj do wcześniejszych wypowiedzi.\n"
  + "5. POSTAWA: Bądź uprzejmy, cierpliwy i pomocny. Nie odmawiaj odpowiedzi na normalne pytania.\n"
  + "6. POPRAWIANIE: Jeśli użytkownik podał nieprawdziwą informację, możesz delikatnie sprostować.\n"
  + "7. ODPOWIEDZI: Bądź konkretny i na temat. Dostosuj długość odpowiedzi do kontekstu.";

export class PiAgentService {
  async stream(
    _tenantId: string,
    messages: { role: string; content: string }[],
    callbacks: StreamCallbacks,
  ): Promise<void> {
    callbacks.onStatus("🧠 UBEK Agent thinking...");

    const apiKey = getRouterApiKey();
    if (!apiKey) {
      callbacks.onError(new Error("Router API key not configured"));
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);

    try {
      const response = await fetch(`${ROUTER_URL}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
        },
        body: JSON.stringify({
          model: "opencode:deepseek-v4-flash",
          messages: [
            { role: "system", content: UBEK_SYSTEM },
            ...messages,
          ],
          stream: true,
          max_tokens: 4096,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const err = await response.text().catch(() => "Unknown");
        callbacks.onError(new Error(`Router error ${response.status}: ${err}`));
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        callbacks.onError(new Error("No response body"));
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let hasContent = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;
          const data = trimmed.slice(6);
          if (data === "[DONE]") {
            callbacks.onDone();
            return;
          }
          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content || "";
            if (content) {
              hasContent = true;
              callbacks.onToken(content);
            }
          } catch {
            // skip malformed JSON
          }
        }
      }

      if (!hasContent) {
        callbacks.onToken("Przepraszam, nie mogłem przetworzyć tego zapytania.");
      }
      callbacks.onDone();
    } catch (err: any) {
      if (err.name === "AbortError") {
        callbacks.onError(new Error("Przepraszam, przekroczono limit czasu. Spróbuj ponownie."));
      } else {
        callbacks.onError(err instanceof Error ? err : new Error(String(err)));
      }
    } finally {
      clearTimeout(timeout);
    }
  }
}