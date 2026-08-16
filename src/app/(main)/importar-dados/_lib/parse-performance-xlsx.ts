import { createHash } from "node:crypto";

import { read, utils, type WorkBook } from "xlsx";

type CellValue = string | number | boolean | Date | null | undefined;

const MONTHS: Record<string, number> = {
  janeiro: 1,
  fevereiro: 2,
  marco: 3,
  abril: 4,
  maio: 5,
  junho: 6,
  julho: 7,
  agosto: 8,
  setembro: 9,
  outubro: 10,
  novembro: 11,
  dezembro: 12,
};

const REQUIRED_HEADERS = ["ID do anúncio", "SKU", "Visitas únicas", "Unidades vendidas"];

export interface ParsedPerformanceRow {
  line: number;
  periodStart: string;
  periodEnd: string;
  skuRaw: string | null;
  mlbRaw: string;
  visits: number | null;
  salesCount: number | null;
  unitsSold: number | null;
  grossSales: number | null;
  conversion: number | null;
  statusCurrent: string | null;
  variation: string | null;
  adQuality: string | null;
  purchaseExperience: string | null;
  uniqueBuyers: number | null;
  participation: number | null;
  buyerConversion: number | null;
  totalReviews: number | null;
  badReviews: number | null;
  goodReviews: number | null;
  sourceRowHash: string;
}

export interface ParsedPerformanceFile {
  periodStart: string;
  periodEnd: string;
  rows: ParsedPerformanceRow[];
  problems: { line: number; message: string }[];
}

function text(value: CellValue): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalize(value: CellValue): string {
  return text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("pt-BR");
}

function nullableText(value: CellValue): string | null {
  return text(value) || null;
}

function integer(value: CellValue): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? Math.trunc(value) : null;
  const normalized = text(value).replace(/\./g, "").replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

function decimal(value: CellValue): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const normalized = text(value).replace(/R\$/gi, "").replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function percentage(value: CellValue): number | null {
  const normalized = text(value).replace("%", "").replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed / 100 : null;
}

function isoDate(day: string, monthName: string, year: string): string | null {
  const month = MONTHS[normalize(monthName)];
  const dayNumber = Number(day);
  const yearNumber = Number(year);
  if (!month || !Number.isInteger(dayNumber) || !Number.isInteger(yearNumber)) return null;
  const candidate = new Date(Date.UTC(yearNumber, month - 1, dayNumber));
  if (
    candidate.getUTCFullYear() !== yearNumber ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== dayNumber
  ) {
    return null;
  }
  return `${yearNumber}-${String(month).padStart(2, "0")}-${String(dayNumber).padStart(2, "0")}`;
}

function reportPeriod(rows: CellValue[][]): { start: string; end: string } | null {
  const scope = rows.slice(0, 6).flat().map(text).find((value) => /este relatório mostra as métricas/i.test(value));
  if (!scope) return null;

  const single = scope.match(/no dia\s+(\d{1,2})\s+de\s+([\p{L}]+)\s+de\s+(\d{4})/iu);
  if (single) {
    const date = isoDate(single[1], single[2], single[3]);
    return date ? { start: date, end: date } : null;
  }

  const range = scope.match(
    /de\s+(\d{1,2})\s+de\s+([\p{L}]+)\s+de\s+(\d{4})\s+até\s+(\d{1,2})\s+de\s+([\p{L}]+)\s+de\s+(\d{4})/iu,
  );
  if (!range) return null;
  const start = isoDate(range[1], range[2], range[3]);
  const end = isoDate(range[4], range[5], range[6]);
  return start && end ? { start, end } : null;
}

function workbookRows(workbook: WorkBook): CellValue[][] {
  for (const name of workbook.SheetNames) {
    const rows = utils.sheet_to_json<CellValue[]>(workbook.Sheets[name], { header: 1, raw: true, defval: null });
    if (rows.some((row) => REQUIRED_HEADERS.every((required) => row.some((cell) => normalize(cell) === normalize(required))))) {
      return rows;
    }
  }
  throw new Error("A planilha de desempenho de anúncios não foi encontrada.");
}

function headerIndexes(row: CellValue[]): Map<string, number> {
  return new Map(row.map((value, index) => [normalize(value), index]));
}

function field(row: CellValue[], indexes: Map<string, number>, header: string): CellValue {
  return row[indexes.get(normalize(header)) ?? -1];
}

function normalizeMlb(value: CellValue): string | null {
  const digits = text(value).toUpperCase().replace(/^MLB/, "").replace(/\D/g, "");
  return digits ? `MLB${digits}` : null;
}

function rowHash(row: Omit<ParsedPerformanceRow, "line" | "sourceRowHash">): string {
  return createHash("sha256").update(JSON.stringify(row)).digest("hex");
}

export function parsePerformanceWorkbook(workbook: WorkBook): ParsedPerformanceFile {
  const rows = workbookRows(workbook);
  const period = reportPeriod(rows);
  if (!period) throw new Error("Não foi possível identificar o período do relatório de desempenho.");

  const headerLine = rows.findIndex((row) =>
    REQUIRED_HEADERS.every((required) => row.some((cell) => normalize(cell) === normalize(required))),
  );
  if (headerLine < 0) throw new Error("Cabeçalho do relatório de desempenho não encontrado.");
  const indexes = headerIndexes(rows[headerLine]);
  const parsed: ParsedPerformanceRow[] = [];
  const problems: { line: number; message: string }[] = [];

  for (let index = headerLine + 1; index < rows.length; index += 1) {
    const source = rows[index];
    const line = index + 1;
    const mlbRaw = normalizeMlb(field(source, indexes, "ID do anúncio"));
    if (!mlbRaw && !source.some((value) => text(value))) continue;
    if (!mlbRaw) {
      problems.push({ line, message: "ID do anúncio inválido" });
      continue;
    }

    const withoutHash: Omit<ParsedPerformanceRow, "line" | "sourceRowHash"> = {
      periodStart: period.start,
      periodEnd: period.end,
      skuRaw: nullableText(field(source, indexes, "SKU")),
      mlbRaw,
      visits: integer(field(source, indexes, "Visitas únicas")),
      salesCount: integer(field(source, indexes, "Quantidade de vendas")),
      unitsSold: integer(field(source, indexes, "Unidades vendidas")),
      grossSales: decimal(field(source, indexes, "Vendas brutas (BRL)")),
      conversion: percentage(field(source, indexes, "Conversão de visitas em vendas")),
      statusCurrent: nullableText(field(source, indexes, "Status atual")),
      variation: nullableText(field(source, indexes, "Variação")),
      adQuality: nullableText(field(source, indexes, "Qualidade do anúncio")),
      purchaseExperience: nullableText(field(source, indexes, "Experiência de compra")),
      uniqueBuyers: integer(field(source, indexes, "Compradores únicos")),
      participation: percentage(field(source, indexes, "% de participação")),
      buyerConversion: percentage(field(source, indexes, "Conversão de visitas em compradores")),
      totalReviews: integer(field(source, indexes, "Total de opiniões")),
      badReviews: integer(field(source, indexes, "Opiniões ruins")),
      goodReviews: integer(field(source, indexes, "Opiniões boas")),
    };
    parsed.push({ line, ...withoutHash, sourceRowHash: rowHash(withoutHash) });
  }

  return { periodStart: period.start, periodEnd: period.end, rows: parsed, problems };
}

export function parsePerformanceXlsx(buffer: Buffer): ParsedPerformanceFile {
  return parsePerformanceWorkbook(read(buffer, { type: "buffer", cellDates: true }));
}
