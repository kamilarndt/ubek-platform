# UBEK — User Workflows

**Status:** Active · **Version:** 1.0 · **Updated:** 2026-05-29
**See also:** [PRD](01-PRD.md), [ARCHITECTURE](02-ARCHITECTURE.md)

---

## 1. Core Chat Flow

```
┌─────────────────────────────────────┐
│  Chat Interface                     │
│  ┌──────────────────────────────┐   │
│  │  Message history (scrollable) │   │
│  │  User → "Cześć!"             │   │
│  │  ← Bot: "Cześć! Jestem       │   │
│  │    UBEK..." (streaming)      │   │
│  │  [Input field]    [Send]     │   │
│  └──────────────────────────────┘   │
└─────────────────────────────────────┘
```

| Situation | Behavior |
|-----------|----------|
| Empty message | Send button disabled |
| Network error | Error in chat, user can retry |
| LLM timeout | "Przepraszam, wystąpił błąd. Spróbuj ponownie." |
| Rapid clicking | Button disabled during loading |
| 5000+ char message | Accepted, streamed normally |

---

## 2. Auth Flow

```
/chat (unauthenticated) → redirect → /auth/sign-in
├── Success → JWT in localStorage → redirect to /
└── Error   → Show error message
```

Dev shortcut: `GET /api/auth/dev-set-token` → returns JWT directly.

---

## 3. Session History Flow

```
User clicks sidebar (☰)
┌──────────────────────────────┐
│  📋 Planowanie eventu (2h)  │
│  📋 Research konkurencji    │
│  📋 Nowa rozmowa (today)    │
│  [↻ New Chat]               │
└──────────────────────────────┘
├── Click session → Load history → Continue
└── New Chat → Clear → Start fresh
```

- Auto-named from first message
- User can rename (pencil icon)
- Sorted by last message (newest first)

---

## 4. Vault / KB Flow

```
Vault Panel
┌─────────────┐ ┌───────────────┐
│ Knowledge   │ │ Document      │
│ Base        │ │ Storage       │
│ cennik.pdf  │ │ raport-Q1.md │
│ instrukcja  │ │ analiza.csv  │
│ [📤 Upload] │ │ [📤 Upload]  │
└─────────────┘ └───────────────┘
```

**Zone Rules:**
| Zone | RAG Source | Agent Write |
|------|-----------|-------------|
| Knowledge Base | ✅ Yes | ❌ No |
| Document Storage | ❌ No (unless asked) | ✅ Yes |

---

## 5. RAG Query Flow

```
User question
    → POST /api/rag/search(query, kbId)
    → pgvector similarity
    → Inject context into LLM prompt
    → Bot response with [Źródło N] citations
    → User clicks citation → source preview sidebar
```

**Edge cases:** No KB → "Brak informacji". No match → "Nie znalazłem". Multiple KBs → user selects.

---

## 6. Memory / Personalization Flow

```
User: "Nazywam się Kamil, pracuję jako scenograf"
    → LLM responds (visible)
    → ASYNC: Memory API extracts facts → pgvector (hidden)

Later: "Co o mnie wiesz?"
    → Memory search → Inject facts → "Wiem że masz na imię Kamil..."

User opens privacy panel:
┌─────────────────────────┐
│  📌 Imię: Kamil  [🗑]  │
│  📌 Zawód: Scenograf [🗑]│
│  [🗑 Wyczyść wszystko]  │
└─────────────────────────┘
```

---

## 7. Document Export Flow

```
User: "Wygeneruj raport"
    → Bot writes content → User approves/edits
    → Click Export → Choose format (MD/PDF/DOCX)
    → POST /api/documents/generate → Download
```

---

## 8. Error Recovery

| Error | Behavior |
|-------|----------|
| LLM unavailable | Input disabled, warning shown |
| SSE drops mid-stream | Partial response preserved, retry option |
| Upload fails | Toast: format/size limits |


---

## 9. Extension Request Flow

User w czacie: Potrzebuje generowac oferty dla klientow
    -> Agent: Rozumiem, zglaszam potrzebe. Admin sie tym zajmie.
    -> Admin Dashboard: NOWE ZGLOSZENIE w /admin/requests/
    -> Admin: ocenia -> BUILD .ts extension -> TEST sandbox -> DEPLOY na tego tenanta
    -> User: w sidebarze pojawia sie nowa zakladka Oferty
    -> Agent ma nowe narzedzie pi.registerTool

| Krok | Kto | Co |
|------|-----|-----|
| 1 | User | Mowi czego potrzebuje w czacie |
| 2 | Agent | Zglasza potrzebe do Admin Dashboard |
| 3 | Admin | Ocenia, buduje extension, testuje |
| 4 | Admin | Deployuje na konkretnego uzytkownika |
| 5 | System | Sidebar usera odswieza sie z nowa zakladka |
| 6 | User | Korzysta z nowej funkcji |

User nigdy nie widzi procesu budowy. Dla niego to magia - powiedzial, dostal.

## 10. Admin Workflows

### 10.1 Agent Monitor
- Podglad aktywnych sesji kazdego agenta
- Historia promptow i odpowiedzi audyt
- Wyszukiwanie wzorcow bledow
- Filtrowanie po userze, dacie, typie bledu

### 10.2 Error Console
- Logi bledow w czasie rzeczywistym
- Timeouty, rate limiting, injection attempts per agent
- Stack trace + kontekst sesji
- Mozliwosc wyslania testowego promptu reprodukcja

### 10.3 Extension Builder
- Edytor pliku .ts z pi.registerTool
- Sandbox - testowanie w izolacji bez wplywu na produkcje
- Podglad jak extension bedzie wygladal w UI zakladka, komponent
- Deploy na wybranego tenanta lub wszystkich

### 10.4 Personality Config
- Per-user system prompt override globalnego
- Podglad jak agent odpowiada test prompt
- Szablon neutralny asystent = default
- Reset do defaultu jednym klikiem