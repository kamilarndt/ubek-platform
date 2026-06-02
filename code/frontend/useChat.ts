"use client";

import { useState, useCallback, useEffect, useRef } from "react";

const API_BASE =
    process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

function authHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
    };
    if (typeof window !== "undefined") {
        const token = localStorage.getItem("ubek_token");
        if (token) {
            headers["Authorization"] = `Bearer ${token}`;
        }
    }
    return headers;
}

// ── Knowledge Base API ─────────────────────────────────────────────────────

export interface KnowledgeBase {
    id: string;
    name: string;
    description: string;
    fileCount?: number;
    createdAt: string;
}

export interface KBFile {
    id: string;
    name: string;
    type: string;
    size: number;
    addedAt: string;
}

/** Create a new Knowledge Base */
export async function createKB(
    name: string,
    description: string,
): Promise<KnowledgeBase> {
    const res = await fetch(`${API_BASE}/api/knowledge-bases`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ name, description }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
}

/** List all Knowledge Bases */
export async function listKBs(): Promise<KnowledgeBase[]> {
    const res = await fetch(`${API_BASE}/api/knowledge-bases`, {
        method: "GET",
        headers: authHeaders(),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
}

/** Get a single Knowledge Base by ID with its files */
export async function getKB(id: string): Promise<KnowledgeBase & { files: KBFile[] }> {
    const res = await fetch(`${API_BASE}/api/knowledge-bases/${id}`, {
        method: "GET",
        headers: authHeaders(),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
}

/** Delete a Knowledge Base */
export async function deleteKB(id: string): Promise<void> {
    const res = await fetch(`${API_BASE}/api/knowledge-bases/${id}`, {
        method: "DELETE",
        headers: authHeaders(),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || `HTTP ${res.status}`);
    }
}

/** Add a file to a Knowledge Base */
export async function addFileToKB(
    kbId: string,
    fileId: string,
): Promise<void> {
    const res = await fetch(`${API_BASE}/api/knowledge-bases/${kbId}/files`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ fileId }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || `HTTP ${res.status}`);
    }
}

/** Remove a file from a Knowledge Base */
export async function removeFileFromKB(
    kbId: string,
    fileId: string,
): Promise<void> {
    const res = await fetch(
        `${API_BASE}/api/knowledge-bases/${kbId}/files/${fileId}`,
        {
            method: "DELETE",
            headers: authHeaders(),
        },
    );
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || `HTTP ${res.status}`);
    }
}

// ── Document Generation API ────────────────────────────────────────────────

export type DocFormat = "pdf" | "markdown" | "docx";

export interface GenerateDocParams {
    title: string;
    content: string;
    format: string;
    includeToc?: boolean;
}

/** Generate a document via the backend */
export async function generateDocument(
    params: GenerateDocPar

... [OUTPUT TRUNCATED - 8500 chars omitted out of 18500 total] ...

            };
                                }
                                return next;
                            });
                        }
                    }
                }
            }
        } catch (err: any) {
            setError(err.message || "Failed to send message");
            setMessages((prev) => {
                const next = [...prev];
                if (next.length > 0) {
                    next[next.length - 1] = {
                        ...next[next.length - 1],
                        content: `❌ ${err.message || "Failed to send message"}`,
                    };
                }
                return next;
            });
        } finally {
            setIsLoading(false);
        }
    }, [messages, isLoading]);

    const retry = useCallback(async () => {
        if (messages.length < 2 || isLoading) return;

        const lastAssistantIdx = messages.length - 1;
        const lastUserIdx = messages.length - 2;

        if (messages[lastAssistantIdx].role !== "assistant" || messages[lastUserIdx].role !== "user") {
            return;
        }

        const trimmed = messages[lastUserIdx].content;
        const withoutLastAssistant = messages.slice(0, -1);
        setMessages(withoutLastAssistant);

        setIsLoading(true);
        setError(null);

        const assistantMsg: ChatMessage = {
            id: crypto.randomUUID(),
            role: "assistant",
            content: "",
        };

        setMessages((prev) => [...prev, assistantMsg]);

        const history = withoutLastAssistant.slice(0, -1).map((m) => ({
            role: m.role,
            content: m.content,
        }));

        let ragCtx = "";
        try {
            const ragRes = await fetch(`${API_BASE}/api/rag/search`, {
                method: "POST",
                headers: authHeaders(),
                body: JSON.stringify({ query: trimmed }),
            });
            if (ragRes.ok) {
                const ragData = await ragRes.json();
                if (ragData.hasResults && ragData.ragContext) {
                    ragCtx = "\n\nDokumenty w Knowledge Base:\n" + ragData.ragContext;
                }
            }
        } catch {}

        const fullHistory = [...history, { role: "user", content: trimmed }];
        if (ragCtx) {
            fullHistory.unshift({
                role: "system",
                content: ragCtx,
            });
        }

        try {
            const res = await fetch(`${API_BASE}/api/chat/stream`, {
                method: "POST",
                headers: authHeaders(),
                body: JSON.stringify({ messages: fullHistory }),
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({ error: res.statusText }));
                throw new Error(errData.error || `HTTP ${res.status}`);
            }

            const reader = res.body?.getReader();
            if (!reader) throw new Error("No response body");

            const decoder = new TextDecoder();
            let buffer = "";
            let acc = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() || "";
                for (const line of lines) {
                    if (!line.startsWith("data: ")) continue;
                    const data = line.slice(6).trim();
                    if (data === "[DONE]") continue;
                    try {
                        const p = JSON.parse(data);
                        if (p.type === "text" && p.content) {
                            acc += p.content;
                            setMessages((prev) => {
                                const next = [...prev];
                                if (next.length > 0) {
                                    next[next.length - 1] = {
                                        ...next[next.length - 1],
                                        content: acc,
                                    };
                                }
                                return next;
                            });
                        }
                    } catch {
                        if (data && data !== "[DONE]") {
                            acc += data;
                            setMessages((prev) => {
                                const next = [...prev];
                                if (next.length > 0) {
                                    next[next.length - 1] = {
                                        ...next[next.length - 1],
                                        content: acc,
                                    };
                                }
                                return next;
                            });
                        }
                    }
                }
            }
        } catch (err: any) {
            setError(err.message || "Failed to retry message");
            setMessages((prev) => {
                const next = [...prev];
                if (next.length > 0) {
                    next[next.length - 1] = {
                        ...next[next.length - 1],
                        content: `❌ ${err.message || "Failed to retry message"}`,
                    };
                }
                return next;
            });
        } finally {
            setIsLoading(false);
        }
    }, [messages, isLoading]);

    const clearMessages = useCallback(() => {
        setMessages([]);
    }, []);

    return {
        messages,
        isLoading,
        error,
        sendMessage,
        retry,
        clearMessages,
        sessions,
        loadSessions,
        deleteSession,
        sessionsLoading,
        createKB,
        listKBs,
        deleteKB,
        addFileToKB,
        removeFileFromKB,
        generateDocument,
    };
}