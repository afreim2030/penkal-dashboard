import { read, utils, type WorkBook } from "xlsx";

import { createHash } from "node:crypto";

type CellValue = string | number | boolean | Date | null | undefined;
const REQUIRED_HEADERS = ["Desde", "Até", "Campanha", "Código do anúncio", "Impressões", "Investimento (Moeda local)"];

export interface ParsedAdsRow {
  line: number;
  periodStart: string;
  periodEnd: string;
  campaignName: string;
  title: string | null;
  mlbRaw: string;
  status: string | null;
  impressions: number | null;
  clicks: number | null;
  cpc: number | null;
  ctr: number | null;
  conversion: number | null;
  revenue: number | null;
  investment: number | null;
  acos: number | null;
  roas: number | null;
  directSales: number | null;
  indirectSales: number | null;
  sourceRowHash: string;
}

export interface ParsedAdsFile {
  periodStart: string;
  periodEnd: string;
  rows: ParsedAdsRow[];
  problems: { line: number; message: string }[];
}

function text(value: CellValue): string {
  return value === null || value === undefined ? "" : String(value).trim();
}

function normalize(value: CellValue): string {
  return text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("pt-BR");
}

function decimal(value: CellValue): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const raw = text(value);
  if (!raw || raw === "-") return null;
  const normalized = raw.replace(/R\$/gi, "").replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function integer(value: CellValue): number | null {
  const parsed = decimal(value);
  return parsed === null ? null : Math.trunc(parsed);
}

function percent(value: CellValue): number | null {
  const parsed = decimal(value);
  return parsed === null ? null : parsed / 100;
}

function isoDate(value: CellValue): string | null {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) return value.toISOString().slice(0, 10);
  const raw = normalize(value).replace(/\./g, "");
  const months: Record<string, string> = {
    jan: "01",
    fev: "02",
    mar: "03",
    abr: "04",
    mai: "05",
    jun: "06",
    jul: "07",
    ago: "08",
    set: "09",
    out: "10",
    nov: "11",
    dez: "12",
  };
  const match = raw.match(/^(\d{1,2})[-/]([a-z]{3})[-/](\d{4})$/);
  if (!match || !months[match[2]]) return null;
  return `${match[3]}-${months[match[2]]}-${match[1].padStart(2, "0")}`;
}

function normalizeMlb(value: CellValue): string | null {
  const digits = text(value).toUpperCase().replace(/^MLB/, "").replace(/\D/g, "");
  return digits ? `MLB${digits}` : null;
}

function workbookRows(workbook: WorkBook): CellValue[][] {
  for (const name of workbook.SheetNames) {
    const rows = utils.sheet_to_json<CellValue[]>(workbook.Sheets[name], { header: 1, raw: true, defval: null });
    if (
      rows.some((row) => REQUIRED_HEADERS.every((header) => row.some((cell) => normalize(cell) === normalize(header))))
    )
      return rows;
  }
  throw new Error("A aba 'Relatório Anúncios patrocinados' não foi encontrada.");
}

function field(row: CellValue[], indexes: Map<string, number>, header: string): CellValue {
  return row[indexes.get(normalize(header)) ?? -1];
}

export function parseAdsWorkbook(workbook: WorkBook): ParsedAdsFile {
  const rows = workbookRows(workbook);
  const headerLine = rows.findIndex((row) =>
    REQUIRED_HEADERS.every((header) => row.some((cell) => normalize(cell) === normalize(header))),
  );
  if (headerLine < 0) throw new Error("Cabeçalho do relatório de publicidade não encontrado.");
  const indexes = new Map(rows[headerLine].map((value, index) => [normalize(value), index]));
  const parsed: ParsedAdsRow[] = [];
  const problems: { line: number; message: string }[] = [];

  for (let index = headerLine + 1; index < rows.length; index += 1) {
    const source = rows[index];
    const line = index + 1;
    if (!source.some((value) => text(value))) continue;
    const periodStart = isoDate(field(source, indexes, "Desde"));
    const periodEnd = isoDate(field(source, indexes, "Até"));
    const campaignName = text(field(source, indexes, "Campanha"));
    const mlbRaw = normalizeMlb(field(source, indexes, "Código do anúncio"));
    if (!periodStart || !periodEnd || !campaignName || !mlbRaw) {
      problems.push({ line, message: "Período, campanha ou código do anúncio inválido" });
      continue;
    }
    const withoutHash = {
      periodStart,
      periodEnd,
      campaignName,
      title: text(field(source, indexes, "Título do anúncio patrocinado")) || null,
      mlbRaw,
      status: text(field(source, indexes, "Status")) || null,
      impressions: integer(field(source, indexes, "Impressões")),
      clicks: integer(field(source, indexes, "Cliques")),
      cpc: decimal(field(source, indexes, "CPC (Custo por clique)")),
      ctr: percent(field(source, indexes, "CTR (Click Through Rate)")),
      conversion: percent(field(source, indexes, "CVR (Conversion rate)")),
      revenue: decimal(field(source, indexes, "Receita (Moeda local)")),
      investment: decimal(field(source, indexes, "Investimento (Moeda local)")),
      acos: percent(field(source, indexes, "ACOS (Investimento / Receitas)")),
      roas: decimal(field(source, indexes, "ROAS (Receitas / Investimento)")),
      directSales: integer(field(source, indexes, "Vendas diretas")),
      indirectSales: integer(field(source, indexes, "Vendas indiretas")),
    };
    const sourceRowHash = createHash("sha256").update(JSON.stringify(withoutHash)).digest("hex");
    parsed.push({ line, ...withoutHash, sourceRowHash });
  }
  if (!parsed.length) throw new Error("O relatório não contém linhas de publicidade válidas.");
  return { periodStart: parsed[0].periodStart, periodEnd: parsed[0].periodEnd, rows: parsed, problems };
}

export function parseAdsXlsx(buffer: Buffer): ParsedAdsFile {
  return parseAdsWorkbook(read(buffer, { type: "buffer", cellDates: true }));
}
