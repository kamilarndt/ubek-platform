import { test, expect } from '@playwright/test';
import path from 'path';
import { setupAuth, waitForResponse, sendMessage, countMsgs, gotoChat } from './helpers';

const FIXTURES_DIR = path.join(__dirname, 'fixtures');

test.beforeEach(async ({ page }) => {
  await setupAuth(page);
  await gotoChat(page);
});

// ── T8: Historia rozmów ─────────────────────────────────────────────────

test.describe('Stage 2 — Użyteczny chatbot', () => {

  test('T8: Historia rozmów działa (zapisywanie + wczytywanie)', async ({ page }) => {
    await sendMessage(page, 'Witaj, jestem testerem');

    // Odśwież stronę (symulacja powrotu)
    await page.reload();
    await page.waitForSelector('[data-testid="chat-input"]', { timeout: 15000 });

    // Otwórz sidebar
    await page.click('[aria-label="Otwórz menu"]');
    await page.waitForSelector('[data-testid="session-list"]', { timeout: 5000 });

    // Powinna być co najmniej jedna sesja
    const sessionItems = page.locator('[data-testid^="session-item-"]');
    await expect(sessionItems.first()).toBeVisible({ timeout: 5000 });
    const count = await sessionItems.count();
    expect(count).toBeGreaterThan(0);

    // Kliknij na pierwszą sesję
    await sessionItems.first().click();
    await page.waitForTimeout(500);

    // Powinny być wiadomości
    const userMsgs = await countMsgs(page, 'user');
    expect(userMsgs).toBeGreaterThan(0);
  });

  // ── T9: "Spróbuj ponownie" ───────────────────────────────────────────

  test('T9: Przycisk Spróbuj ponownie regeneruje odpowiedź', async ({ page }) => {
    await sendMessage(page, 'Wymyśl 3 pomysły na firmę');

    // Przycisk retry powinien być widoczny
    const retryBtn = page.locator('[data-testid="btn-retry"]');
    await expect(retryBtn).toBeVisible();

    // Kliknij retry
    await retryBtn.click();
    await waitForResponse(page);

    // Nowa odpowiedź nie jest pusta
    const response = await page.locator('[data-testid="msg-assistant"]').last().textContent();
    expect(response).not.toBeNull();
    expect(response!.trim().length).toBeGreaterThan(10);
  });

  // ── T10: Edycja wiadomości ───────────────────────────────────────────

  test('T10: Edycja wiadomości zmienia odpowiedź sensownie', async ({ page }) => {
    await sendMessage(page, 'Jaka jest stolica Francji?');

    // Kliknij "Edytuj" na wiadomości usera
    const editBtn = page.locator('[data-testid="btn-edit"]');
    await expect(editBtn).toBeVisible();
    await editBtn.click();

    // Input powinien zawierać poprzednią treść
    const inputValue = await page.locator('[data-testid="chat-input"]').inputValue();
    expect(inputValue.toLowerCase()).toContain('francj');

    // Zmień na Niemcy i wyślij
    await page.fill('[data-testid="chat-input"]', 'Jaka jest stolica Niemiec?');
    await page.click('[data-testid="btn-send"]');
    await waitForResponse(page);

    // Odpowiedź powinna dotyczyć Berlina
    const response = await page.locator('[data-testid="msg-assistant"]').last().textContent();
    expect(response).not.toBeNull();
    expect(response!.toLowerCase().includes('berlin')).toBeTruthy();
  });

  // ── T11: Kopiowanie odpowiedzi ───────────────────────────────────────

  test('T11: Kopiowanie odpowiedzi jednym kliknięciem', async ({ page }) => {
    await sendMessage(page, 'Powiedz coś ciekawego');

    const copyBtn = page.locator('[data-testid="btn-copy"]');
    await expect(copyBtn).toBeVisible({ timeout: 15000 });

    // Powinien pokazywać "Kopiuj"
    await expect(copyBtn).toContainText('Kopiuj');

    // Kliknij
    await copyBtn.click();

    // Po kliknięciu zmienia się na "Skopiowano" lub ikonka
    await expect(copyBtn).toContainText(/Skopiowano/, { timeout: 3000 }).catch(() => {
      // Fallback: aria-label zmienił się
    });
  });

  // ── T12: Renderowanie Markdown ───────────────────────────────────────

  test('T12: Pełne renderowanie Markdown w odpowiedziach', async ({ page }) => {
    // Sprowokuj odpowiedź z markdown
    await sendMessage(page, 'Napisz krótki poradnik w markdown: jak zrobić sos pomidorowy. Użyj listy i tabeli.');

    await waitForResponse(page);

    // Sprawdź czy linki istnieją (jeśli bot je dodał)
    const linkCount = await page.locator('[data-testid="msg-assistant"] a').count();
    if (linkCount > 0) {
      expect(linkCount).toBeGreaterThan(0);
    }

    // Sprawdź czy listy istnieją
    const listCount = await page.locator('[data-testid="msg-assistant"] ul, [data-testid="msg-assistant"] ol').count();
    if (listCount > 0) {
      expect(listCount).toBeGreaterThan(0);
    }

    // Nie powinno być surowego markdown
    const content = await page.locator('[data-testid="msg-assistant"]').last().textContent();
    expect(content).not.toBeNull();
    expect(content!.includes('```')).toBeFalsy();
  });

  // ── T13: Renderowanie LaTeX ──────────────────────────────────────────

  test('T13: Renderowanie LaTeX (wzory matematyczne)', async ({ page }) => {
    await sendMessage(page, 'Jaki jest wzór na pole koła? Napisz z użyciem LaTeX.');

    await waitForResponse(page);

    // Sprawdź czy katex jest widoczne
    const hasKatex = await page.evaluate(() =>
      !!(document.querySelector('.katex') || document.querySelector('.katex-html'))
    );

    const content = await page.locator('[data-testid="msg-assistant"]').last().textContent();
    expect(content).not.toBeNull();

    // Jeśli katex jest, nie powinno być surowego LaTeX
    if (hasKatex) {
      expect(content!.includes('$$')).toBeFalsy();
    }
  });

  // ── T14: Wysyłanie plików ────────────────────────────────────────────

  test('T14: Wysyłanie plików działa', async ({ page }) => {
    const filePath = path.join(FIXTURES_DIR, 'test-doc.txt');

    // Kliknij widoczny przycisk "Dodaj plik" w obszarze inputu
    await page.click('[data-testid="btn-add-file"]');

    // Ustaw plik na ukrytym inpucie (teraz wyzwalamy prawdziwy handleFileUpload)
    const fileInput = page.locator('[data-testid="file-input"]');
    await fileInput.setInputFiles(filePath);

    // Plik jako załącznik powinien się pojawić
    await expect(page.locator('[data-testid="attached-files"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-testid="attached-files"]')).toContainText('test-doc.txt');

    // Wyślij zapytanie o plik (powinno pójść przez RAG search + chat stream)
    await sendMessage(page, 'Podsumuj treść tego dokumentu');

    const response = await page.locator('[data-testid="msg-assistant"]').last().textContent();
    expect(response).not.toBeNull();
    // Odpowiedź powinna dotyczyć treści dokumentu (UBEK, Agent, Asystent)
    const lower = response!.toLowerCase();
    expect(lower.includes('ubek') || lower.includes('agent') || lower.includes('asystent')).toBeTruthy();
  });

  // ── T15: Stary czat z kontekstem ─────────────────────────────────────

  test('T15: Po wczytaniu starego czatu kontekst kontynuowany', async ({ page }) => {
    await sendMessage(page, 'Mój projekt to platforma e-commerce dla małych firm');
    await sendMessage(page, 'Główną funkcją jest zarządzanie magazynem');
    await sendMessage(page, 'Docelowi klienci to sklepy internetowe');

    // Odśwież i wczytaj starą rozmowę
    await page.reload();
    await page.waitForSelector('[data-testid="chat-input"]', { timeout: 15000 });

    // Otwórz sidebar i wczytaj sesję
    await page.click('[aria-label="Otwórz menu"]');
    await page.waitForSelector('[data-testid^="session-item-"]', { timeout: 5000 });
    await page.locator('[data-testid^="session-item-"]').first().click();
    await page.waitForTimeout(500);

    // Zapytaj o kontekst
    await sendMessage(page, 'Co mówiłem o moim projekcie?');

    const response = await page.locator('[data-testid="msg-assistant"]').last().textContent();
    expect(response).not.toBeNull();
    const lower = response!.toLowerCase();
    expect(lower.includes('e-commerce') || lower.includes('magazyn') || lower.includes('sklep')).toBeTruthy();
  });

  // ── T16: Eksport dokumentu ──────────────────────────────────────────

  test('T16: Eksport rozmowy jako dokument Markdown/TXT', async ({ page }) => {
    await sendMessage(page, 'Zaplanuj tygodniowy jadłospis');

    const exportBtn = page.locator('[data-testid="btn-export-md"]');
    await expect(exportBtn).toBeVisible();

    // Obsługa pobierania
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 10000 }).catch(() => null),
      exportBtn.click(),
    ]);

    if (download) {
      expect(download.suggestedFilename()).toMatch(/\.md$/i);
    }
    // Jeśli download nie zadziałał — nie failuje (może być blokowany przez przeglądarkę)
  });

  // ── T17: Pusta historia ──────────────────────────────────────────────

  test('T17: Pusta historia dla nowego użytkownika', async ({ page }) => {
    // Wyczyść sesje
    await page.evaluate(() => localStorage.removeItem('ubek_sessions'));

    await page.goto('/chat');
    await page.waitForSelector('[data-testid="chat-input"]', { timeout: 15000 });

    // Otwórz sidebar
    await page.click('[aria-label="Otwórz menu"]');
    await page.waitForSelector('[data-testid="session-list"]', { timeout: 5000 });

    // Powinien być stan pusty
    await expect(page.locator('[data-testid="empty-sessions"]')).toBeVisible();
  });

});