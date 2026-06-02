# Ubek — Context

Platforma AI czatu gdzie każdy użytkownik ma własnego Pi Agenta który rozwija się wraz z nim. FAZA 1 (MVP) waliduje popyt rynkowy — max 20 użytkowników. Po osiągnięciu 15+ płacących i >4000 PLN/miesiąc następuje gruntowny redesign (FAZA 2).

## Language

**Użytkownik**:
Osoba z kontem w systemie, trial lub płatna. Każdy użytkownik = 1 tenant = 1 Pi Agent.
_Avoid_: Klient, tenant (wewnętrznie), customer

**Agent**:
Instancja Pi Agenta przypisana do użytkownika. Ma własną pamięć (pgvector), własne extensiony, własny system prompt (SKILL.md) oraz zestaw Default Tools (vision, file upload, document generation, web search, memory). Każdy nowy agent otrzymuje te narzędzia automatycznie na starcie. Rozwija się wraz z użytkownikiem poprzez dodawanie kolejnych extensionów.
_Avoid_: Bot, asystent (zbyt ogólne)

**Extension**:
Plik `.ts` który rejestruje narzędzia przez `pi.registerTool()`. Rozszerza możliwości Agenta. Produkt do sprzedania per użytkownik.
_Avoid_: Plugin, moduł, dodatek

**Backend**:
Warstwa Express (:4000) między frontendem a Pi Agentem. Robi: auth (JWT + bcrypt + guardrails), vault (CRUD), chat (SSE), agents (lista + create), admin (overview + dashboard settings), health. NIE używa Pi Agent SDK bezpośrednio — woła Router LLM (:18881) dla wszystkich operacji LLM.
_Avoid_: Serwer, API (zbyt ogólne)

**Pi Agent SDK**:
`@earendil-works/pi-coding-agent` — silnik AI. Zainstalowany w package.json ale nieużywany w głównym flow. Backend woła Router LLM (:18881) zamiast SDK bezpośrednio. Plan migration: przyszłość.
_Avoid_: Pi CLI, subprocess

**Vault**:
Przechowalnia plików użytkownika — dwie strefy: Knowledge Base (pliki wrzucone przez użytkownika) i Document Storage (dokumenty wygenerowane przez Agenta).
_Avoid_: Storage, file system

**Onboarding**:
Seria pytań które Agent zadaje nowemu użytkownikowi po rejestracji. Wynik: profil użytkownika, konfiguracja Agenta, pierwsze rozszerzenia.
_Avoid_: Rejestracja, setup, wizard


**Admin Dashboard**:
Panel administratora na /admin. Pozwala na: podglad wszystkich agentow i ich zachowan (Agent Monitor), przegladanie zgloszen uzytkownikow o nowe funkcje (Extension Requests), budowanie extensionow (.ts builder), testowanie w sandboxie, deployowanie na konkretnych tenantow, konfiguracje per-user personality.
*Avoid:* Admin panel, backend panel

**Extension Request**:
Zgloszenie od uzytkownika (przez agenta) o potrzebe nowej funkcjonalnosci. Trafia do Admin Dashboard jako task. User nie widzi procesu budowy - dostaje gotowa funkcje.

**Personality (per-user)**:
Sposob w jaki agent komunikuje sie z konkretnym uzytkownikiem. **Default: neutralny, rzeczowy asystent** - zadnego "absolutnie!", "swietnie!", "z przyjemnoscia!". Zero wymuszonej empatii. Ma pomagac rozwiazywac problemy, nie bawic w przyjaciela. Admin moze skonfigurowac per-user przez dashboard.
*Avoid:* Empatyczny bot, BigTech styl

**Sidebar Dynamic**:
Lewy panel w frontendzie. Zakladki laduja sie dynamicznie z listy extensionow uzytkownika. Kazdy extension moze dodac 0..N zakladek/stron.
- Bez extensionow -> tylko Chat + Vault + Settings
- Z extensionem -> pojawia sie dedykowana zakladka
- Ladowane przez extension-loader.ts + component-registry.ts

---

## Terminy dodane

**Guardrails**:
System zabezpieczeń backendu — InjectionDetector (wykrywanie prompt injection), AuditLogger (logowanie audytowe), RateLimiter (limit zapytań), chatGuard (zbiorcza walidacja czatu).
_Avoid_: Security layer, firewall

**A2A**:
Agent-to-Agent daemon na porcie 18765. Łączy 19 agentów w ekosystemie Pi. Używany do komunikacji między agentami (np. pi-scout → pi-coder).
_Avoid_: Message queue, IPC

**Memory API**:
Osobny serwis na porcie 18765, PostgreSQL + pgvector (1024d). Przechowuje embeddingi faktów, preferencji i kontekstu. Auto-sync z agentami Pi. UWAGA: to jest dedykowana pamić UBEK -- NIE łączy się z Memory API ArndtOs na porcie 8765.
_Avoid_: Redis, cache

**Default Tools**:
Zestaw narzędzi który KAŻDY nowy Pi Agent otrzymuje automatycznie na starcie -- odpowiadający standardowym funkcjom chatbotów BigTech (ChatGPT, Claude, Gemini, Grok):
- **Vision** -- odczytywanie zdjęć, screenshotów, diagramów
- **File Upload & Analysis** -- przetwarzanie PDF, obrazów, dokumentów (przez Vault)
- **Document Generation** -- generowanie raportów, umów, cenników
- **Web Search** -- przeszukiwanie internetu (przez SearXNG lub Router LLM)
- **Memory** -- zapis i odczyt pamięci długoterminowej (przez UBEK Memory API na :18765)
Agent może mieć dodatkowe extensiony (płatne lub darmowe), ale Default Tools są zawsze aktywne.

## Relationships

- **Użytkownik** ma dokładnie jednego **Agenta**
- **Agent** ładuje listę **Extensionów** (z `settings.json` użytkownika)
- **Agent** woła **Backend** przez HTTP (`localhost:4000/api/...`) dla operacji auth/storage/billing
- **Backend** woła **Router LLM** (:18881) dla operacji AI — NIGDY bezpośrednio modeli
- **Vault** należy do **Użytkownika** — nikt inny nie ma dostępu
- **Guardrails** chronią każdy endpoint backendu
- **A2A** łączy agentów w ekosystemie
- **Memory API** przechowuje embeddingi agentów

## Example dialogue

> **Dev:** "Gdzie trafia obraz który użytkownik wrzuca?"
> **Domain expert:** "Do Vault — najpierw jako plik przez Backend, potem Agent indeksuje go przez vision extension i zapisuje embedding w pamięci pgvector."
>
> **Dev:** "A jeśli użytkownik nie zapłaci?"
> **Domain expert:** "Ma status trial — Agent działa, ale ma ograniczony zestaw extensionów (tylko core). Po zapłacie odblokowuje się reszta."

## Flagged ambiguities

- **Trial vs Active**: Trial ma **pełną funkcjonalność** — żadnych ograniczeń. Różnica jest tylko w statusie płatności. Użytkownik płaci bo chce wspierać rozwój, nie żeby odblokować funkcje.
- "tenant" używane w kodzie na określenie **Użytkownika** — w FAZIE 1 to synonim, w FAZIE 2 może być osobny koncept (firma = tenant, pracownicy = użytkownicy).
- "brain" — stary katalog z MemoryManager i Research pipeline, który został wycięty z backendu. Memory działa przez dedykowane Memory API UBEK (:18765), research przez SearXNG.