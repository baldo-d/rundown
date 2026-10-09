/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
/**
 * End-to-end smoke test against a running server.
 *   BASE_URL=http://localhost:4000 EDITOR_PIN=2026 npx tsx scripts/smoke.ts
 */
import { chromium, type Page } from 'playwright';
import ExcelJS from 'exceljs';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const base = process.env.BASE_URL ?? 'http://localhost:4000';
const pin = process.env.EDITOR_PIN ?? '2026';
const out = process.env.SCREENSHOTS ?? 'screenshots';
mkdirSync(out, { recursive: true });

const errors: string[] = [];
const check = (cond: unknown, msg: string) => {
  if (!cond) throw new Error(`FALLITO: ${msg}`);
  console.log(`✓ ${msg}`);
};

async function login(page: Page) {
  await page.goto(base);
  await page.getByPlaceholder('PIN').fill(pin);
  await page.getByRole('button', { name: 'Entra' }).click();
  await page.waitForSelector('.rundown-table');
}

const titles = (page: Page) =>
  page.$$eval('.rt-item [data-field="title"]', (els) => els.map((e) => (e as HTMLInputElement).value));

const run = Date.now().toString(36).slice(-4);
const TALK = `Nuovo talk di prova ${run}`;
const BLOCK = `Blocco test ${run}`;

async function main() {
  const browser = await chromium.launch(
    process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  );
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && !m.text().includes('fonts.g') && !m.text().includes('401') && errors.push(m.text()));

  // wrong pin
  await page.goto(base);
  await page.getByPlaceholder('PIN').fill('0000');
  await page.getByRole('button', { name: 'Entra' }).click();
  await page.getByText('PIN non valido').waitFor();
  check(true, 'PIN errato rifiutato');

  await login(page);
  check(await page.locator('.rt-item').count() > 5, 'scaletta di esempio caricata');
  await page.screenshot({ path: join(out, '01-scaletta.png') });

  // select last row then add an event after it
  const before = await page.locator('.rt-item').count();
  await page.locator('.rt-item').last().locator('.rt-end, .block-meta').first().click();
  await page.locator('.toolbar').getByRole('button', { name: 'Evento', exact: true }).click();
  await page.waitForFunction((n) => document.querySelectorAll('.rt-item').length === n + 1, before);
  await page.keyboard.type(TALK);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  const t1 = await titles(page);
  check(t1[t1.length - 1] === TALK, 'nuovo evento aggiunto in fondo e titolo modificato');

  // duration edit updates end time
  const lastRow = page.locator('.rt-item').last();
  const dur = lastRow.getByLabel('Durata');
  await dur.fill('1h15');
  await dur.press('Enter');
  await page.waitForTimeout(300);
  check((await dur.inputValue()) === '1h 15m', 'durata "1h15" interpretata');

  // add a delay before the last event: select previous row, press R
  await page.locator('.rt-item').nth(-2).locator('.rt-end').click();
  await page.keyboard.press('r');
  await page.waitForSelector('.rt-delay');
  await page.waitForTimeout(400);
  check(await page.locator('.rt-item').last().locator('.expected').count() === 1, 'ritardo mostra orario previsto');

  // add a block with keyboard
  await page.keyboard.press('Escape');
  await page.locator('body').click({ position: { x: 5, y: 5 } }).catch(() => {});
  await page.locator('.rt-item').first().locator('.block-meta').click();
  await page.keyboard.press('b');
  await page.waitForTimeout(400);
  await page.keyboard.type(BLOCK);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  check((await titles(page)).includes(BLOCK), 'blocco aggiunto da tastiera');

  // reorder with Alt+Down
  const orderBefore = await titles(page);
  const idx = orderBefore.indexOf(BLOCK);
  await page.locator('.rt-item').nth(idx).locator('.block-meta').click();
  await page.keyboard.press('Alt+ArrowDown');
  await page.waitForTimeout(500);
  const orderAfter = await titles(page);
  check(orderAfter.indexOf(BLOCK) === idx + 1, 'voce spostata con Alt+↓');

  // drag & drop: move "Blocco test" back up using the handle
  await page.$eval('.table-scroll', (el) => (el.scrollLeft = 0));
  const dragged = page.locator('.rt-item').nth(idx + 1);
  const handle = dragged.locator('.rt-handle');
  const target = page.locator('.rt-item').nth(idx);
  const hb = (await handle.boundingBox())!;
  const db = (await dragged.boundingBox())!;
  const tb = (await target.boundingBox())!;
  // move so that the dragged row's centre lands on the target row's centre
  const dy = tb.y + tb.height / 2 - (db.y + db.height / 2);
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2 - 8, { steps: 4 });
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2 + dy - 4, { steps: 12 });
  await page.waitForTimeout(200);
  if (process.env.DEBUG_DRAG) {
    await page.screenshot({ path: join(out, 'drag-mid.png') });
    console.log(idx, hb, db, tb, dy);
  }
  await page.mouse.up();
  await page.waitForTimeout(600);
  const afterDrag = await titles(page);
  check(afterDrag.indexOf(BLOCK) === idx, `voce spostata con trascinamento (${idx} -> ${afterDrag.indexOf(BLOCK)})`);

  // fixed start time -> gap notice
  const talkRow = page.locator('.rt-item').filter({ has: page.locator(`[data-field="title"][value="${TALK}"]`) });
  const start = talkRow.getByLabel('Inizio');
  await start.fill('19:00');
  await start.press('Enter');
  await page.waitForTimeout(400);
  check(await talkRow.locator('.rt-gap').count() === 1, 'orario fisso genera avviso di pausa/sovrapposizione');
  await page.screenshot({ path: join(out, '02-scaletta-modificata.png') });

  // inspector + live sync with a second editor
  const page2 = await (await browser.newContext({ viewport: { width: 1300, height: 800 } })).newPage();
  await login(page2);
  await page.locator('.rt-event').nth(1).locator('.rt-end').click();
  const ins = page.locator('.inspector');
  await ins.locator('textarea').first().fill('Nota dall’ispettore');
  await ins.locator('textarea').first().blur();
  await page2.waitForFunction(
    () => [...document.querySelectorAll('.rt-item input')].some((i) => (i as HTMLInputElement).value === 'Nota dall’ispettore'),
    undefined,
    { timeout: 5000 },
  );
  check(true, 'modifica sincronizzata in tempo reale su un secondo editor');
  await page.screenshot({ path: join(out, '03-ispettore.png') });
  await page2.close();

  // multi-select + batch color
  await page.locator('.rt-event').nth(1).locator('.rt-end').click();
  await page.locator('.rt-event').nth(3).locator('.rt-end').click({ modifiers: ['Shift'] });
  check((await page.locator('.rt-item.selected').count()) >= 2, 'selezione multipla con Maiusc');
  await ins.getByRole('button', { name: '#77c785' }).click();
  await page.waitForTimeout(400);

  // details panel: close with ×, reopen from the toolbar, toggle with I
  await page.locator('.inspector-header').getByRole('button', { name: 'Nascondi dettagli' }).click();
  check((await page.locator('.inspector').count()) === 0, 'pannello dettagli nascosto con ×');
  await page.locator('.toolbar').getByRole('button', { name: 'Mostra dettagli' }).click();
  check((await page.locator('.inspector').count()) === 1, 'pannello dettagli riaperto dalla barra strumenti');
  await page.locator('.rt-event').first().locator('.rt-end').click();
  await page.keyboard.press('i');
  check((await page.locator('.inspector').count()) === 0, 'pannello dettagli nascosto con il tasto I');
  await page.keyboard.press('i');
  check((await page.locator('.inspector').count()) === 1, 'pannello dettagli riaperto con il tasto I');

  // column dividers + reorder columns by dragging the header
  const headerCols = () => page.$$eval('.rt-header .rt-col', (els) => els.map((e) => e.getAttribute('data-col')));
  const firstRowCols = () =>
    page
      .locator('.rt-event')
      .first()
      .evaluate((el) => [...el.querySelectorAll('.rt-cell')].map((c) => c.getAttribute('data-col')));
  check(
    (await page.locator('.rt-event').first().locator('.rt-cell').first().evaluate((el) => getComputedStyle(el).borderLeftStyle)) === 'solid',
    'divisori tra le colonne della scaletta',
  );
  await page.$eval('.table-scroll', (el) => (el.scrollLeft = 0));
  const defaultOrder = await headerCols();
  const titleBox = (await page.locator('.rt-col[data-col="title"]').boundingBox())!;
  const startBox = (await page.locator('.rt-col[data-col="start"]').boundingBox())!;
  const dx = startBox.x + startBox.width / 2 - (titleBox.x + titleBox.width / 2);
  await page.mouse.move(titleBox.x + titleBox.width / 2, titleBox.y + titleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(titleBox.x + titleBox.width / 2 - 10, titleBox.y + titleBox.height / 2, { steps: 4 });
  await page.mouse.move(titleBox.x + titleBox.width / 2 + dx, titleBox.y + titleBox.height / 2, { steps: 15 });
  await page.waitForTimeout(200);
  await page.mouse.up();
  await page.waitForTimeout(300);
  const colOrder = await headerCols();
  check(colOrder.indexOf('title') === colOrder.indexOf('start') - 1, `colonna Titolo spostata prima di Inizio (${colOrder.join(',')})`);
  check((await firstRowCols()).join() === colOrder.join(), 'le celle delle righe seguono il nuovo ordine');
  await page.reload();
  await page.waitForSelector('.rt-header .rt-col');
  check((await headerCols()).join() === colOrder.join(), 'ordine delle colonne mantenuto dopo il ricaricamento');
  await page.locator('.toolbar').getByRole('button', { name: 'Colonne' }).click();
  await page.locator('.popover').getByRole('button', { name: 'Ripristina ordine predefinito' }).click();
  check((await headerCols()).join() === defaultOrder.join(), 'ordine predefinito ripristinato');
  await page.locator('.popover').getByRole('button', { name: 'Sposta giù: Cue' }).click();
  check((await headerCols())[1] === 'cue', 'colonna spostata con i pulsanti ↑/↓');
  await page.locator('.popover').getByRole('button', { name: 'Ripristina ordine predefinito' }).click();
  await page.locator('.toolbar').getByRole('button', { name: 'Colonne' }).click();
  await page.screenshot({ path: join(out, '09-colonne.png') });

  // overview
  await page.getByRole('link', { name: 'Panoramica' }).click();
  await page.waitForSelector('.ov-event');
  check(await page.locator('.ov-event').count() > 3, 'panoramica mostra gli eventi');
  await page.screenshot({ path: join(out, '04-panoramica.png') });

  // settings: add a custom field
  await page.getByRole('link', { name: 'Impostazioni' }).click();
  await page.getByRole('button', { name: 'Aggiungi campo' }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(out, '05-impostazioni.png'), fullPage: true });

  // import from xlsx
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Programma');
  ws.addRow(['Programma Sala 2 – bozza']);
  ws.addRow(['Ora', 'Titolo', 'Relatore', 'Note']);
  ws.addRow(['09:30', 'Registrazione', '', 'Desk accrediti']);
  ws.addRow(['10:00', 'Workshop città', 'Mario Rossi', '']);
  ws.addRow(['11:30', 'Pausa caffè', '', '']);
  ws.addRow(['12:00', 'Tavola rotonda', 'Vari', 'Microfoni x4']);
  ws.addRow(['13:00', 'Pranzo', '', '']);
  const file = join(out, 'import-test.xlsx');
  await wb.xlsx.writeFile(file);

  await page.getByRole('link', { name: 'Importa / Esporta' }).click();
  await page.locator('select').nth(0).selectOption({ label: 'Giorno 2' });
  await page.locator('.import-wizard input[type=file]').setInputFiles(file);
  await page.waitForSelector('.preview-table');
  check((await page.locator('.preview-table tbody tr').count()) === 5, 'anteprima import con 5 righe (intestazione rilevata alla riga 2)');
  await page.screenshot({ path: join(out, '06-import.png'), fullPage: true });
  await page.getByRole('button', { name: /^Importa \(/ }).click();
  await page.getByText('5 voci importate').waitFor();
  check(true, 'import applicato');

  // check the imported rundown
  await page.getByRole('link', { name: 'Scaletta', exact: true }).click();
  await page.locator('.sidebar-day').nth(1).getByRole('link').first().click();
  await page.waitForFunction(() => document.querySelectorAll('.rt-item').length === 5);
  const t2 = await titles(page);
  check(t2[0] === 'Registrazione' && t2[4] === 'Pranzo', 'scaletta importata visibile nel Giorno 2');

  // exports
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.goto(`${base}/importa-esporta`).then(() => page.getByRole('link', { name: 'Scarica backup (JSON)' }).click()),
  ]);
  check(download.suggestedFilename().endsWith('.json'), `backup scaricato (${download.suggestedFilename()})`);

  // print view
  const meta: { days: { id: string }[]; stages: unknown[] } = await page.evaluate(() =>
    fetch('/api/meta').then((r) => r.json()),
  );
  await page.goto(`${base}/stampa/${meta.days[0].id}`);
  await page.waitForSelector('.print-sheet table');
  check((await page.locator('.print-sheet').count()) === meta.stages.length, 'stampa giornata con un foglio per palco');
  await page.screenshot({ path: join(out, '07-stampa.png'), fullPage: true });

  // mobile layout
  const mobile = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await login(mobile);
  await mobile.screenshot({ path: join(out, '08-mobile.png') });
  const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  check(!overflow, 'nessuno scroll orizzontale della pagina su mobile');

  await browser.close();
  check(errors.length === 0, `nessun errore in console${errors.length ? `: ${errors.join(' | ')}` : ''}`);
}

main().catch((err) => {
  console.error(err);
  if (errors.length) console.error('Errori console:', errors);
  process.exit(1);
});
