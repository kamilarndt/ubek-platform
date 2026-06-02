'use client';

import React from 'react';
import { CentralChat } from '@/components/Chat/CentralChat';

/**
 * /chat — Clean from-scratch rebuild using ONLY ready shadcn/ui components.
 * Every functionality (real streaming, plan proposals, tool diffs, palette, input, keyboard)
 * has its proper odwzorowanie built from shadcn primitives (Collapsible, Command+Dialog,
 * Button, Badge, Textarea, Card, ScrollArea) + the real backend from lib/useChat.
 * Ciemno-shara dark sharp palette, dense, keyboard-first.
 */
export default function ChatPage() {
  return (
    <div className="fixed inset-0 z-50 h-screen w-screen overflow-hidden bg-[#0a0a0a] text-[#e4e4e4] antialiased">
      <CentralChat />
    </div>
  );
}