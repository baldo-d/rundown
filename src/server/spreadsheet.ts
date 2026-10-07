import ExcelJS from 'exceljs';
import Papa from 'papaparse';
import type { CustomField, Day, Entry, Rundown, Stage } from '../shared/types';
import { computeTimeline } from '../shared/timeline';
import { formatClock, formatDurationHMS } from '../shared/time';

export interface ParsedSheet {
  name: string;
  rows: string[][];
}

const MAX_ROWS = 2000;
const MAX_COLS = 60;
const pad = (n: number) => String(n).padStart(2, '0');

/** Converts any spreadsheet cell value into the text a person would see. */
function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) {
    // Excel stores pure times as dates on 1899-12-30 (UTC)
    const time = `${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}:${pad(value.getUTCSeconds())}`;
    if (value.getUTCFullYear() < 1901) return time;
    const date = `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;
    return value.getUTCHours() || value.getUTCMinutes() ? `${date} ${time}` : date;
  }
  if (typeof value === 'object') {
    if ('richText' in value) return value.richText.map((r) => r.text).join('');
    if ('text' in value && typeof value.text === 'string') return value.text;
    if ('result' in value) return cellText(value.result as ExcelJS.CellValue);
    if ('error' in value) return '';
    return '';
  }
  return String(value);
}

/** Parses an uploaded XLSX or CSV file into sheets of text rows. */
export async function parseSpreadsheet(buffer: Buffer, filename = ''): Promise<ParsedSheet[]> {
  const isZip = buffer.length > 3 && buffer[0] === 0x50 && buffer[1] === 0x4b;
  if (isZip) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    return workbook.worksheets.map((sheet) => {
      const rows: string[][] = [];
      const width = Math.min(sheet.columnCount, MAX_COLS);
      sheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
        if (rowNumber > MAX_ROWS) return;
        const cells: string[] = [];
        for (let c = 1; c <= width; c++) cells.push(cellText(row.getCell(c).value).trim());
        rows[rowNumber - 1] = cells;
      });
      for (let i = 0; i < rows.length; i++) rows[i] ??= [];
      return { name: sheet.name, rows };
    });
  }
  if (/\.xls$/i.test(filename)) throw new Error('Formato .xls non supportato: salva il file come .xlsx o .csv');
  const text = buffer.toString('utf8').replace(/^﻿/, '');
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: false });
  const rows = parsed.data.slice(0, MAX_ROWS).map((r) => r.slice(0, MAX_COLS).map((c) => String(c ?? '').trim()));
  return [{ name: filename.replace(/\.[^.]+$/, '') || 'CSV', rows }];
}

const TYPE_LABEL: Record<Entry['type'], string> = { event: 'Evento', block: 'Blocco', delay: 'Ritardo' };

export interface ExportRundown {
  day: Day;
  stage: Stage;
  rundown: Rundown;
  entries: Entry[];
}

/** Builds the table (header + rows) that represents a rundown in exports. */
export function rundownTable(data: ExportRundown, customFields: CustomField[]): string[][] {
  const header = [
    'Tipo',
    'Cue',
    'Inizio',
    'Fine',
    'Durata',
    'Orario fisso',
    'Titolo',
    'Relatori',
    'Note',
    'Colore',
    'Pubblico',
    'Salta',
    ...customFields.map((f) => f.label),
  ];
  const timeline = computeTimeline(data.entries, data.rundown.startTime);
  const rows = timeline.rows.map(({ entry, start, end }) => [
    TYPE_LABEL[entry.type],
    entry.cue,
    entry.type === 'delay' ? '' : formatClock(start),
    entry.type === 'delay' ? '' : formatClock(end),
    entry.type === 'block' ? formatDurationHMS(end - start) : formatDurationHMS(entry.duration),
    entry.timeStart === null ? '' : formatClock(entry.timeStart),
    entry.title,
    entry.speakers,
    entry.note,
    entry.color,
    entry.isPublic ? 'sì' : 'no',
    entry.skip ? 'sì' : '',
    ...customFields.map((f) => entry.custom[f.id] ?? ''),
  ]);
  return [header, ...rows];
}

const sheetName = (data: ExportRundown, used: Set<string>) => {
  const base = `${data.day.label} - ${data.stage.name}`.replace(/[\\/?*[\]:]/g, ' ').slice(0, 28);
  let name = base;
  for (let i = 2; used.has(name.toLowerCase()); i++) name = `${base.slice(0, 26)} ${i}`;
  used.add(name.toLowerCase());
  return name;
};

export async function exportXlsx(rundowns: ExportRundown[], customFields: CustomField[], title: string) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = title;
  workbook.created = new Date();
  const used = new Set<string>();
  for (const data of rundowns) {
    const sheet = workbook.addWorksheet(sheetName(data, used));
    const table = rundownTable(data, customFields);
    table.forEach((r) => sheet.addRow(r));
    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.columns.forEach((col, i) => {
      col.width = [10, 6, 8, 8, 10, 12, 40, 30, 40, 10, 9, 6][i] ?? 20;
    });
    data.entries.forEach((entry, i) => {
      if (entry.type === 'block') {
        const row = sheet.getRow(i + 2);
        row.font = { bold: true };
        if (/^#[0-9a-f]{6}$/i.test(entry.color)) {
          row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${entry.color.slice(1)}` } };
        }
      }
    });
  }
  if (rundowns.length === 0) workbook.addWorksheet('Scaletta');
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export function exportCsv(data: ExportRundown, customFields: CustomField[]): string {
  return '﻿' + Papa.unparse(rundownTable(data, customFields));
}
