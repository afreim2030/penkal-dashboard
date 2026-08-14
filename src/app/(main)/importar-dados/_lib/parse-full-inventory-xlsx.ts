import { read, utils, type WorkBook } from "xlsx";

import type { FullImportProblem } from "./full-import-types";

type CellValue = string | number | boolean | Date | null | undefined;

const REQUIRED_HEADERS = [
  "sku",
  "# anuncio",
  "produto",
  "unidades no full",
  "unidades que afetam a metrica de tempo de estoque",
  "vendas ultimos 30 dias (un.)",
];

export interface ParsedFullInventoryRow {
  line: number;
  skuRaw: string;
  mlbRaw: string | null;
  mlbs: string[];
  title: string | null;
  quantityFull: number;
  sales30d: number | null;
  unitsAffectStockTime: number | null;
}

export interface ParsedFullInventoryFile {
  rows: ParsedFullInventoryRow[];
  rowCount: number;
  problems: FullImportProblem[];
  headerLine: number;
}

function text(value: CellValue): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalized(value: CellValue): string {
  return text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("pt-BR");
}

function integer(value: CellValue): number | null {
  if (typeof value === "number") return Number.isFinite(value) && Number.isInteger(value) ? value : null;
  const valueText = text(value);
  if (!valueText) return null;
  const parsed = Number(valueText.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) && Number.isInteger(parsed) ? parsed : null;
}

export function normalizeFullMlbs(value: CellValue): string[] {
  const seen = new Set<string>();
  for (const part of text(value).split("|")) {
    const digits = part
      .toUpperCase()
      .replace(/^\s*ML[AB]/, "")
      .replace(/\D/g, "");
    if (digits) seen.add(`MLB${digits}`);
  }
  return [...seen];
}

function findHeader(rows: CellValue[][]): number {
  return rows.findIndex((row) => {
    const values = new Set(row.map(normalized));
    return REQUIRED_HEADERS.every((header) => values.has(header));
  });
}

function column(row: CellValue[], header: string): number {
  return row.findIndex((value) => normalized(value) === header);
}

function fullGroupEnd(workbook: WorkBook, headerRow: number, start: number): number {
  const sheet = workbook.Sheets.Resumo;
  const merge = (sheet["!merges"] ?? []).find(({ s, e }) => s.r === headerRow && s.c === start && e.c >= start);
  if (!merge) throw new Error('O grupo "Unidades no Full" não possui a estrutura esperada.');
  return merge.e.c;
}

export function parseFullInventoryWorkbook(workbook: WorkBook): ParsedFullInventoryFile {
  const sheet = workbook.Sheets.Resumo;
  if (!sheet) throw new Error('A aba obrigatória "Resumo" não foi encontrada.');

  const range = utils.decode_range(sheet["!ref"] ?? "A1");
  const rows = utils.sheet_to_json<CellValue[]>(sheet, {
    header: 1,
    defval: null,
    raw: true,
    range: { s: { r: 0, c: 0 }, e: range.e },
  });
  const headerRow = findHeader(rows);
  if (headerRow < 0) throw new Error("Não foi possível localizar dinamicamente o cabeçalho do estoque FULL.");

  const headers = rows[headerRow];
  const skuColumn = column(headers, "sku");
  const mlbColumn = column(headers, "# anuncio");
  const titleColumn = column(headers, "produto");
  const quantityStart = column(headers, "unidades no full");
  const quantityEnd = fullGroupEnd(workbook, headerRow, quantityStart);
  const salesColumn = column(headers, "vendas ultimos 30 dias (un.)");
  const stockTimeColumn = column(headers, "unidades que afetam a metrica de tempo de estoque");
  const codeColumn = column(headers, "codigo ml");
  const problems: FullImportProblem[] = [];
  const parsedRows: ParsedFullInventoryRow[] = [];
  const seenSkus = new Set<string>();
  let rowCount = 0;

  for (let rowIndex = headerRow + 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    const hasIdentityData = [codeColumn, skuColumn, mlbColumn, titleColumn].some(
      (index) => index >= 0 && text(row[index]),
    );
    if (!hasIdentityData) continue;
    rowCount += 1;
    const line = rowIndex + 1;
    const skuRaw = text(row[skuColumn]);
    if (!skuRaw) {
      problems.push({ line, message: "SKU vazio", severity: "error" });
      continue;
    }
    if (seenSkus.has(skuRaw)) {
      problems.push({ line, message: `SKU duplicado no arquivo: ${skuRaw}`, severity: "error" });
      continue;
    }
    seenSkus.add(skuRaw);

    let quantityFull = 0;
    let invalidQuantity = false;
    for (let index = quantityStart; index <= quantityEnd; index += 1) {
      const rawQuantity = row[index];
      const parsedQuantity = integer(rawQuantity);
      if (!text(rawQuantity)) {
        problems.push({ line, message: 'Quantidade vazia no grupo "Unidades no Full"', severity: "error" });
        invalidQuantity = true;
        break;
      }
      if (parsedQuantity === null) {
        problems.push({ line, message: 'Quantidade inválida no grupo "Unidades no Full"', severity: "error" });
        invalidQuantity = true;
        break;
      }
      if (parsedQuantity < 0) {
        problems.push({ line, message: 'Quantidade negativa no grupo "Unidades no Full"', severity: "error" });
        invalidQuantity = true;
        break;
      }
      quantityFull += parsedQuantity;
    }
    if (invalidQuantity) continue;

    const sales30d = integer(row[salesColumn]);
    const unitsAffectStockTime = integer(row[stockTimeColumn]);
    if (sales30d !== null && sales30d < 0) {
      problems.push({ line, message: "Vendas dos últimos 30 dias inválidas", severity: "error" });
      continue;
    }
    if (unitsAffectStockTime !== null && unitsAffectStockTime < 0) {
      problems.push({ line, message: "Unidades que afetam Tempo de estoque inválidas", severity: "error" });
      continue;
    }

    const mlbs = normalizeFullMlbs(row[mlbColumn]);
    parsedRows.push({
      line,
      skuRaw,
      mlbRaw: mlbs.length ? mlbs.join(" | ") : null,
      mlbs,
      title: text(row[titleColumn]) || null,
      quantityFull,
      sales30d,
      unitsAffectStockTime,
    });
  }

  return { rows: parsedRows, rowCount, problems, headerLine: headerRow + 1 };
}

export function parseFullInventoryXlsx(buffer: Buffer): ParsedFullInventoryFile {
  try {
    return parseFullInventoryWorkbook(read(buffer, { type: "buffer", raw: true }));
  } catch (error) {
    if (error instanceof Error && !/Unsupported ZIP|Invalid HTML|Cannot find/.test(error.message)) throw error;
    throw new Error("Não foi possível ler o arquivo XLSX de estoque FULL.");
  }
}
