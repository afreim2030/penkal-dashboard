import { read, utils, type WorkBook } from "xlsx";

import type { HistoricalRankingProblem } from "./historical-ranking-import-types";

type CellValue = string | number | boolean | Date | null | undefined;
type HistoricalCurve = "A" | "B" | "C" | "D" | "E";

const HEADER_ALIASES = {
  sku: ["sku", "codigo sku", "código sku"],
  name: ["nome", "produto", "nome do produto", "titulo", "título"],
  units: ["quantidade vendida", "unidades vendidas", "unidades", "quantidade"],
} as const;

export interface ParsedHistoricalRankingRow {
  line: number;
  sku: string;
  productName: string | null;
  historicalUnits: number;
  historicalRank: number;
  historicalCurve: HistoricalCurve;
}

export interface ParsedHistoricalRankingFile {
  rows: ParsedHistoricalRankingRow[];
  rowCount: number;
  totalHistoricalUnits: number;
  problems: HistoricalRankingProblem[];
}

function text(value: CellValue): string {
  return value === null || value === undefined ? "" : String(value).trim();
}

function normalized(value: CellValue): string {
  return text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("pt-BR");
}

function matches(value: CellValue, aliases: readonly string[]): boolean {
  const candidate = normalized(value);
  return aliases.some((alias) => candidate === normalized(alias) || candidate.includes(normalized(alias)));
}

function integer(value: CellValue): number | null {
  if (typeof value === "number") return Number.isSafeInteger(value) ? value : null;
  const raw = text(value);
  if (!raw) return null;
  const parsed = Number(raw.replace(/\./g, "").replace(",", "."));
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function curveForCumulativeShare(value: number): HistoricalCurve {
  if (value <= 0.8) return "A";
  if (value <= 0.9) return "B";
  if (value <= 0.95) return "C";
  if (value <= 0.98) return "D";
  return "E";
}

export function parseHistoricalRankingXlsx(buffer: Buffer): ParsedHistoricalRankingFile {
  let workbook: WorkBook;
  try {
    workbook = read(buffer, { type: "buffer", raw: true });
  } catch {
    throw new Error("Não foi possível ler o arquivo XLSX do histórico.");
  }
  const sheet = workbook.Sheets[workbook.SheetNames[0] ?? ""];
  if (!sheet) throw new Error("Nenhuma aba válida foi encontrada no arquivo.");
  const range = utils.decode_range(sheet["!ref"] ?? "A1");
  const values = utils.sheet_to_json<CellValue[]>(sheet, {
    header: 1,
    defval: null,
    raw: true,
    range: { s: { r: 0, c: 0 }, e: range.e },
  });
  const headerIndex = values.findIndex((row) =>
    [HEADER_ALIASES.sku, HEADER_ALIASES.name, HEADER_ALIASES.units].every((aliases) =>
      row.some((value) => matches(value, aliases)),
    ),
  );
  if (headerIndex < 0) throw new Error("Não foi possível localizar as colunas SKU, Nome e Quantidade vendida.");

  const headers = values[headerIndex] ?? [];
  const column = (aliases: readonly string[]) => headers.findIndex((value) => matches(value, aliases));
  const skuColumn = column(HEADER_ALIASES.sku);
  const nameColumn = column(HEADER_ALIASES.name);
  const unitsColumn = column(HEADER_ALIASES.units);
  const problems: HistoricalRankingProblem[] = [];
  const sourceRows: Array<{ line: number; sku: string; productName: string | null; historicalUnits: number }> = [];
  const seen = new Set<string>();

  for (let index = headerIndex + 1; index < values.length; index += 1) {
    const row = values[index] ?? [];
    if (![skuColumn, nameColumn, unitsColumn].some((columnIndex) => text(row[columnIndex]))) continue;
    const line = index + 1;
    const sku = text(row[skuColumn]);
    const historicalUnits = integer(row[unitsColumn]);
    if (!sku) {
      problems.push({ line, message: "SKU vazio", severity: "error" });
      continue;
    }
    if (seen.has(sku)) {
      problems.push({ line, message: `SKU duplicado no arquivo: ${sku}`, severity: "error" });
      continue;
    }
    if (historicalUnits === null || historicalUnits < 0) {
      problems.push({ line, message: `Quantidade vendida inválida para o SKU ${sku}`, severity: "error" });
      continue;
    }
    seen.add(sku);
    sourceRows.push({ line, sku, productName: text(row[nameColumn]) || null, historicalUnits });
  }

  const sorted = [...sourceRows].sort(
    (left, right) => right.historicalUnits - left.historicalUnits || left.sku.localeCompare(right.sku),
  );
  const totalHistoricalUnits = sorted.reduce((total, row) => total + row.historicalUnits, 0);
  let cumulative = 0;
  const rows = sorted.map((row, index) => {
    cumulative += row.historicalUnits;
    return {
      ...row,
      historicalRank: index + 1,
      historicalCurve: curveForCumulativeShare(totalHistoricalUnits ? cumulative / totalHistoricalUnits : 1),
    };
  });

  return { rows, rowCount: sourceRows.length, totalHistoricalUnits, problems };
}
