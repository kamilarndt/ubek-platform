'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { toast } from 'sonner';
import {
  Send,
  Copy,
  Check,
  RotateCcw,
  Edit,
  Upload,
  X,
  File,
  FolderOpen,
  Download,
  History,
  User,
  Loader2,
  Menu,
  Sparkles,
  Database
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import MemoryPanel from '@/components/MemoryPanel';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card } from '@/components/ui/card';

import 'katex/dist/katex.min.css';

// ── Types ────────────────────────────────────────────────────────────────────

interface Msg {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface HistorySession {
  id: string;
  title: string;
  messages: Msg[];
  updatedAt: string;
}

interface KnowledgeBase {
  id: string;
  name: string;
  description: string;
}

// ── Local Storage Helpers ────────────────────────────────────────────────────

function loadLocalMessages(sessionId: string): Msg[] {
  try {
    const cache = JSON.parse(localStorage.getItem('ubek_sessions_msgs_cache') || '{}');
    return cache[sessionId] || [];
  } catch (e) {
    return [];
  }
}

function saveLocalMessages(sessionId: string, msgs: Msg[]) {
  try {
    const cache = JSON.parse(localStorage.getItem('ubek_sessions_msgs_cache') || '{}');
    cache[sessionId] = msgs;
    localStorage.setItem('ubek_sessions_msgs_cache', JSON.stringify(cache));
  } catch (e) {}
}

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('ubek_token');
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }
  return headers;
}

// ── Component ────────────────────────────────────────────────────────────────

export function CentralChat() {
  const [authReady, setAuthReady] = useState(false);
  const [localMessages, setLocalMessages] = useState<Msg[]>([
    { id: 'welcome', role: 'assistant', content: 'Cześć! W czym mogę pomóc?' }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Sidebar & Dialog states
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [historySessions, setHistorySessions] = useState<HistorySession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [lastBackendStatus, setLastBackendStatus] = useState('');
  
  // Knowledge Base panel state
  const [showKb, setShowKb] = useState(false);
  const [kbs, setKbs] = useState<KnowledgeBase[]>([]);
  const [activeKbId, setActiveKbId] = useState<string | null>(null);
  
  // File upload state
  const [attachedFiles, setAttachedFiles] = useState<{ name: string; size: number }[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  // Files attached in the current turn — will be injected directly into the next message context
  const [pendingAttachmentsForThisMessage, setPendingAttachmentsForThisMessage] = useState<{ name: string; content: string }[]>([]);

  // Memory / RODO facts panel
  const [showMemory, setShowMemory] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Authentication & Init ──────────────────────────────────────────────────

  useEffect(() => {
    const initAuth = async () => {
      let token = localStorage.getItem('ubek_token');
      if (!token) {
    

... [OUTPUT TRUNCATED - 4233 chars omitted out of 14233 total] ...

eout: jeśli backend bardzo długo nie odsyła tokenów (np. wolny recall + LLM),
    // nie zostawiaj interfejsu na zawsze zablokowanego.
    const LOADING_SAFETY_MS = 55000;
    let safetyTimer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      console.warn('[Chat] Safety timeout — forcing loading state clear (backend may be slow)');
      setIsLoading(false);
      setLastBackendStatus('');
      setLocalMessages(prev => {
        const next = [...prev];
        if (next.length > 0 && next[next.length - 1].role === 'assistant' && !next[next.length - 1].content?.trim()) {
          next[next.length - 1] = {
            ...next[next.length - 1],
            content: 'Nadal myślę... (odpowiedź może być opóźniona)'
          };
        }
        return next;
      });
      safetyTimer = null;
    }, LOADING_SAFETY_MS);

    const clearSafetyTimer = () => {
      if (safetyTimer) {
        clearTimeout(safetyTimer);
        safetyTimer = null;
      }
    };

    try {
      const token = localStorage.getItem('ubek_token');

      // Attempt RAG context lookup
      let ragCtx = '';
      try {
        const ragRes = await fetch('http://localhost:4000/api/rag/search', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          body: JSON.stringify({ query: textToSend, kbId: activeKbId })
        });
        if (ragRes.ok) {
          const ragData = await ragRes.json();
          if (ragData.citations) {
            ragCtx = '\n\nDokumenty w Knowledge Base:\n' + ragData.citations;
          }
        }
      } catch (e) {
        console.warn('[RAG] Search failed:', e);
      }

      // Direct injection of files attached in *this* turn (highest priority for "podsumuj ten dokument" etc.)
      let attachmentBlock = '';
      if (filesForThisMessage.length > 0) {
        attachmentBlock = 'The user attached the following documents for this exact message. Use their full content to answer:\n';
        for (const att of filesForThisMessage) {
          attachmentBlock += `\n--- ${att.name} ---\n${att.content}\n`;
        }
      }

      const history = updatedMessages.slice(0, -2).map(m => ({ role: m.role, content: m.content }));
      const fullHistory = [...history, { role: 'user', content: textToSend }];

      if (attachmentBlock) {
        fullHistory.unshift({ role: 'system', content: attachmentBlock });
      }
      if (ragCtx) {
        fullHistory.unshift({ role: 'system', content: ragCtx });
      }

      const res = await fetch('http://localhost:4000/api/chat/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ messages: fullHistory })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;

          try {
            const p = JSON.parse(data);
            if (p.type === 'text' && p.content) {
              clearSafetyTimer();
              if (lastBackendStatus) setLastBackendStatus(''); // clear "Recalling memory..." etc as soon as real tokens arrive
              streamAcc += p.content;
              setLocalMessages(prev => {
                const next = [...prev];
                if (next.length > 0) {
                  next[next.length - 1] = {
                    ...next[next.length - 1],
                    content: streamAcc
                  };
                }
                return next;
              });
            } else if (p.type === 'status' && p.status) {
              setLastBackendStatus(p.status);
            }
          } catch {
            if (data && data !== '[DONE]') {
              clearSafetyTimer();
              if (lastBackendStatus) setLastBackendStatus(''); // clear status banner on raw token fallback
              streamAcc += data;
              setLocalMessages(prev => {
                const next = [...prev];
                if (next.length > 0) {
                  next[next.length - 1] = {
                    ...next[next.length - 1],
                    content: streamAcc
                  };
                }
                return next;
              });
            }
          }
        }
      }

      // Stream done
      const finalMessages = [...updatedMessages.slice(0, -1), { ...assistantMsg, content: streamAcc }];
      setLocalMessages(finalMessages);
      saveLocalMessages(sid, finalMessages);

      // Persist to backend database
      const title = textToSend.slice(0, 40) || 'Rozmowa';
      await fetch('http://localhost:4000/api/chat/sessions', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ id: sid, title, messages: finalMessages })
      });

      loadHistorySessions();
    } catch (err: any) {
      clearSafetyTimer();
      console.error(err);
      setError(err.message || 'Error occurred');
      setLocalMessages(prev => {
        const next = [...prev];
        if (next.length > 0) {
          next[next.length - 1] = {
            ...next[next.length - 1],
            content: `❌ Błąd: ${err.message || 'Wystąpił problem z połączeniem'}`
          };
        }
        return next;
      });
    } fi