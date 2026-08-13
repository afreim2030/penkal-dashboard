import { read, utils, type WorkBook } from "xlsx";

import type { ImportProblem } from "./listings-import-types";

const SHEET_NAME = "Anúncios";
const HEADER_MARKERS = ["FAMILY_ID", "ITEM_ID", "SKU", "TITLE", "PRICE", "LISTING_TYPE", "STATUS"] as const;

type CellValue = string | number | boolean | Date | null | undefined;

export interface ParsedListingRow {
  line: number;
  sku: string;
  mlb: string;
  title: string;
  listingType: string | null;
  status: string | null;
  price: number | null;
  stockFull: number | null;
}

export interface ParsedListingsFile {
  rows: ParsedListingRow[];
  rowCount: number;
  problems: ImportProblem[];
}

function cellText(value: CellValue): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function parseNumber(value: CellValue): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;

  const text = cellText(value);
  if (!text) return null;

  const normalized = text.includes(",") ? text.replace(/\./g, "").replace(",", ".") : text;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function isDataRow(row: CellValue[], columns: Map<string, number>): boolean {
  const mlb = cellText(row[columns.get("ITEM_ID") ?? -1]);
  const sku = cellText(row[columns.get("SKU") ?? -1]);
  const status = cellText(row[columns.get("STATUS") ?? -1]).toLocaleLowerCase("pt-BR");
  const price = parseNumber(row[columns.get("PRICE") ?? -1]);

  return /^ML[AB]\d+$/i.test(mlb) || (sku !== "" && price !== null) || status === "ativo" || status === "inativo";
}

function workbookRows(workbook: WorkBook): CellValue[][] {
  const sheet = workbook.Sheets[SHEET_NAME];
  if (!sheet) throw new Error(`A aba obrigatória “${SHEET_NAME}” não foi encontrada.`);

  return utils.sheet_to_json<CellValue[]>(sheet, { header: 1, raw: true, defval: null });
}

export function parseListingsWorkbook(workbook: WorkBook): ParsedListingsFile {
  const sourceRows = workbookRows(workbook);
  const headerIndex = sourceRows.findIndex((row) => {
    const cells = new Set(row.map((cell) => cellText(cell).toUpperCase()));
    return HEADER_MARKERS.every((marker) => cells.has(marker));
  });

  if (headerIndex === -1) {
    throw new Error("A linha técnica do relatório de anúncios não foi encontrada.");
  }

  const columns = new Map<string, number>();
  sourceRows[headerIndex].forEach((cell, index) => {
    columns.set(cellText(cell).toUpperCase(), index);
  });

  const firstDataOffset = sourceRows.slice(headerIndex + 1).findIndex((row) => isDataRow(row, columns));
  if (firstDataOffset === -1) return { rows: [], rowCount: 0, problems: [] };

  const rows: ParsedListingRow[] = [];
  const problems: ImportProblem[] = [];
  const dataRows = sourceRows.slice(headerIndex + 1 + firstDataOffset);

  for (const [offset, row] of dataRows.entries()) {
    if (!isDataRow(row, columns)) continue;

    const line = headerIndex + 1 + firstDataOffset + offset + 1;
    const sku = cellText(row[columns.get("SKU") ?? -1]);
    const mlb = cellText(row[columns.get("ITEM_ID") ?? -1]);
    const priceCell = row[columns.get("PRICE") ?? -1];
    const price = parseNumber(priceCell);
    const title = cellText(row[columns.get("TITLE") ?? -1]);

    if (!sku) problems.push({ line, message: "SKU vazio" });
    if (!mlb) problems.push({ line, message: "ITEM_ID vazio" });
    if (!title) problems.push({ line, message: "TITLE vazio" });
    if (cellText(priceCell) && price === null) problems.push({ line, message: "PRICE inválido" });

    rows.push({
      line,
      sku,
      mlb,
      title,
      listingType: cellText(row[columns.get("LISTING_TYPE") ?? -1]) || null,
      status: cellText(row[columns.get("STATUS") ?? -1]) || null,
      price,
      stockFull: parseNumber(row[columns.get("STOCK_FULL") ?? -1]),
    });
  }

  return { rows, rowCount: rows.length, problems };
}

export function parseListingsXlsx(buffer: Buffer): ParsedListingsFile {
  return parseListingsWorkbook(read(buffer, { type: "buffer", cellDates: true }));
}
