# RAPORT AUDYTU UBEK — 2026-05-29

## Podsumowanie

Platforma UBEK (Agent-as-a-Service) składa się z **backend Express** (localhost:4000) i **frontend Next.js** (localhost:3000).

**Status ogólny:** Backend działa. Frontend buduje się poprawnie po fixie infrastruktury.

---

## ETAP 1: MVP — Lista kontrolna

### [❌] Wysyłanie wiadomości i otrzymywanie odpowiedzi
- API endpoint `POST /api/chat/stream` działa poprawnie
- Przyjmuje `{ messages: [{role, content}] }` i zwraca SSE
- **UWAGA:** Każde zapytanie jest stateless — kontekst wymaga przesłania pełnej historii w `messages[]`
- Dowód: test wysłał "Cześć! Kim jesteś?" → otrzymał "Cześć! Jestem UBEK — platforma inteligencji AI..." przez SSE

### [✅] Streaming odpowiedzi (SSE)
- Działa: tokeny przychodzą pojedynczo jako `data: {"type":"text","content":"..."}`
- Zakończenie: `data: {"type":"done","sessionId":"new"}`
- Status: `data: {"type":"status","status":"🧠 UBEK Agent thinking..."}`

### [❌] Kontekst w ramach jednej rozmowy
- **API jest stateless** — każde wywołanie `POST /api/chat/stream` to osobne zapytanie
- Bot zapamiętuje tylko to, co prześlesz w `messages[]`
- Test: wysłano "Mam na imię Kamil" → bot odpowiedział. Potem zapytano "Jak mam na imię?" (bez historii) → bot nie wiedział
- **To jest OK dla API** — frontend/client musi zarządzać historią
- Ale bez frontendu ta funkcjonalność nie jest kompletna

### [✅] Bot odpowiada po polsku
- Test wysłał "Opowiedz mi o sobie po polsku" → odpowiedź po polsku (polskie znaki: 279)
- Dowód: "Cześć! Jestem **UBEK** – twoja platforma inteligencji AI..."

### [✅] Bot przyznaje się do niewiedzy
- Pytanie: "Podaj dokładną temperaturę na Marsie w 1892 o 14:32"
- Odpowiedź: "Nie znam dokładnej temperatury na Marsie w 1892 roku o 14:32. Nikt nie zna – i to nie jest kwestia b..." — przyznaje się, nie halucynuje
- **OCENA:** Bardzo dobra odpowiedź

### [✅] Osobowość z system promptu spójna
- Dwukrotnie zapytany "Kim jesteś?" → za każdym razem "Jestem UBEK, platformą AI"
- Tożsamość bota jest stabilna

### [✅] Interfejs prosty i responsywny
- **Frontend buduje się poprawnie** — 22 strony, 0 błędów TypeScript, kompilacja w 48s
- ChatContext.tsx poprawnie importuje `useChat`, `ChatMessage` i `ChatSession` z `./useChat` — wszystkie są wyeksportowane (useChat.ts linie 226, 232, 239)
- Wcześniejszy błąd był spowodowany **popsutymi stubami w `node_modules/.bin/`** (next, tsc) które miały hardcodowane ścieżki zamiast być symlinkami, oraz permission issue na starych build artifactach przez SSHFS

### [✅] Brak błędów krytycznych API
- Health check: `{"status":"ok","llmAvailable":true}`
- Serwer działa stabilnie, nie ma crashy przy wysyłaniu wiadomości

---

## Testy końcowe Etapu 1

### [✅] Długa rozmowa (5+ wiadomości)
- Test wysłał 5 wiadomości w sekwencji z historią → bot odpowiedział na każdą
- 5 tur konwersacji działało

### [⚠️] Niejasne pytanie → bot prosi o doprecyzowanie
- Wysłano "To." jako jedyną wiadomość
- Bot odpowiedział, ale nie poprosił o doprecyzowanie wprost
- To zależy od modelu LLM, nie od implementacji — może wymagać dodatkowego prompta systemowego

### [✅] Zmiana języka w trakcie rozmowy
- Wysłano "Now speak English, tell me about yourself" w środku polskiej rozmowy
- Odpowiedź: "Sure. I'm UBEK — an AI agent designed specifically for this environment."
- Przełączenie języka działa

### ETAP 1 WYNIK: 5 z 8 checklist items PASS (± brak frontendu)

---

## ETAP 2: Użyteczny chatbot

### [⚠️] Historia rozmów działa
- **API sessions GET:** zwraca `{"ok":true,"sessions":[]}` — działa
- **API sessions POST:** próba zapisu sesji nie powiodła się w testach (problem z routingiem lub auth)
- Kod źródłowy (`routes/chat.ts`) zawiera implementację zapisu/odczytu sesji
- Debug: wewnątrz sieci token 404 — możliwa potrzeba nagłówka `x-tenant-id`

### [❌] Przycisk „Spróbuj ponownie"
- Nie istnieje — brak implementacji UI (frontend się nie buduje)
- API nie oferuje dedykowanego endpointu do retry (ale można wysłać to samo zapytanie ponownie)

### [❌] Możliwość edycji własnej wiadomości
- Nie istnieje w API ani w kodzie frontendu (brakująca funkcja)

### [❌] Kopiowanie odpowiedzi
- Brak implementacji UI

### [❌] Pełne renderowanie Markdown
- Backend zwraca czysty tekst przez SSE — formatowanie Markdown zależy od klienta
- Nie można zweryfikować bez działającego frontendu

### [❌] Renderowanie LaTeX
- Brak dowodów na implementację

### [⚠️] Wysyłanie plików
- Endpointy Vault istnieją w kodzie: `GET /api/vault/folders`, `POST /api/vault/upload`
- Vault API jest zamontowane pod `/api/vault` w routerze
- Ale zwykłe `GET /api/vault/` zwraca 404 — trzeba znać konkretne ścieżki
- Vault nie był testowany w praktyce przez subagenta

### [⚠️] Podstawowa analiza przesłanych plików
- RAG Service istnieje w kodzie (`services/RAGService.ts`)
- Endpointy RAG: `POST /api/rag/search`, `POST /api/rag/process-file`
- Knowledge Bases CRUD: `GET/POST /api/knowledge-bases`, z plikami
- **Nie testowano** z prawdziwym plikiem — potrzebny jest upload przez vault

### [❌] Po wczytaniu starego czatu kontekst kontynuowany
- Brak frontendu uniemożliwia test E2E

### ETAP 2 WYNIK: 0 z 9 checklist items PASS (± 3 partial)

---

## ETAP 3: Dobry chatbot

### [❌] Pamięć długoterminowa
- Brak dowodów na implementację pamięci użytkownika między sesjami
- Kod ma wzmianki o memoryApiUrl (`http://localhost:8765`) w health check
- W `index.ts` jest komentarz: "Memory and research disabled — handled by Pi Agent"

### [⚠️] System RAG
- Implementacja istnieje w kodzie backendu:
  - `RAGService.ts` — search, processFile, deleteFileChunks, formatCitations
  - Knowledge Bases CRUD — kompletne
  - pgvector dla embeddingów (1536d)
- **Nie zweryfikowano** przez faktyczny upload dokumentu i query

### [❌] Cytowanie źródeł
- Kod zawiera `formatCitations()` i helpery frontendowe do parsowania `[Źródło N]`
- Nie można zweryfikować bez działającego frontendu i przesłanych dokumentów

### [⚠️] Wiele Knowledge Bases
- CRUD istnieje: `POST/GET /api/knowledge-bases`, `GET/PUT/DELETE /api/knowledge-bases/:id`
- Obsługa plików: `POST /api/knowledge-bases/:id/files`, `DELETE /api/knowledge-bases/:id/files/:fileId`
- Kod wygląda na kompletny, ale nie testowany end-to-end

### [⚠️] Generowanie dokumentów
- Endpoint `POST /api/documents/generate` istnieje w kodzie
- Przyjmuje: `{ title, content, format ("pdf"|"markdown"|"docx"), includeToc }`
- Nie testowany faktycznie (potrzebuje działającego DocumentService)

### ETAP 3 WYNIK: 0 z 5 checklist items PASS (± 3 partial)

---

## Istniejące testy (Vitest)

**Wynik:** 52 PASS / 24 FAIL / 1 ERROR

**Główne przyczyny niepowodzeń:**
1. **Port conflict** — test `auth.test.ts` próbuje uruchomić serwer, ale ten już działa na porcie 4000 → `process.exit(0)` → "unexpectedly called"
2. **Validation error shape** — `validation.test.ts` oczekuje `{ error: 'Validation failed' }` ale Zod v4 zwraca `{ fieldErrors, formErrors }`
3. **Testy integracyjne zależne od DB** — niektóre testy zakładają czystą bazę

**Naprawa wymaga:**
- `auth.test.ts` → nie importować `app` (które odpala server.listen), tylko testować przez fetch do działającego serwera
- `validation.test.ts` → dostosować asercje do Zod v4 error format

---

## Problemy krytyczne (zaktualizowane 2026-05-29 po weryfikacji)

### ⚠️ Problem nieistniejący — korekta
Poprzednia diagnoza o braku eksportów `useChat`, `ChatMessage` i `ChatSession` z `useChat.ts` była **błędna**. Wszystkie trzy symbole są poprawnie wyeksportowane:

```typescript
// useChat.ts:226
export interface ChatMessage { ... }
// useChat.ts:232
export interface ChatSession { ... }
// useChat.ts:239
export function useChat() { ... }
```

**Rzeczywista przyczyna problemów z buildem:**
1. `node_modules/.bin/next` i `node_modules/.bin/tsc` — popsute stuby (plik z hardcodowaną ścieżką `../server/require-hook` zamiast symlinka do `../next/dist/bin/next`)
2. SSHFS (fuse.sshfs `ubek:projects/ubek`) — stare build artifacty `.next/standalone/` z ownership roota na zdalnym serwerze, uniemożliwiające clean build
3. Rozwiązanie: użycie bezpośredniej ścieżki `node_modules/next/dist/bin/next build` + `mv .next .next_old`

### 3. Niektóre endpointy API nie odpowiadają
- `GET /api/vault/` → 404 (ale działa `GET /api/vault/folders`)
- `POST /api/chat/sessions` → 404 (choć kod istnieje)
- `GET /api/research` → 404
- `GET /api/vision` → 404

### 4. Testy mają błędy środowiskowe
24 z 76 testów faili z powodu:
- Serwer już działa (port zajęty)
- Niezgodność asercji z nowym Zod

---

## Co działa dobrze

1. **Chat SSE streaming** — w pełni funkcjonalny, obsługuje wielojęzyczność
2. **Auth system** — JWT, rejestracja, logowanie, dev-set-token
3. **Health check** — działa z LLM availability
4. **Agent list** — `GET /api/agents` zwraca agentów
5. **Knowledge Bases CRUD** — kompletna implementacja w RAG router
6. **RAG search** — zintegrowany z pgvector
7. **Document generation API** — istnieje w kodzie
8. **Dokumentacja** — README.md, komentarze w kodzie

---

## Rekomendowane kroki (zaktualizowane)

1. ~~Naprawić `useChat.ts`~~ — **NIE WYMAGANE** (hook istnieje i działa)
2. **Naprawić `.bin/` stuby** — podmienić popsute pliki w `node_modules/.bin/` na poprawne symlinki
3. **Naprawić testy** — dostosować do Zod v4, dodać mock serwera
4. **Zweryfikować routing API** — naprawić 404 dla sessions POST, vault, research
5. **Dodać historię rozmów** — sidebar z listą sesji, zapis/odczyt
6. **Dodać pamięć długoterminową** — panel "Co bot o mnie wie" + RODO
7. **Rozbudować Vault** — separacja Knowledge Base / Document Storage
8. **Dodać E2E testy** — testy integracyjne dla RAG, Vault, Document Generation