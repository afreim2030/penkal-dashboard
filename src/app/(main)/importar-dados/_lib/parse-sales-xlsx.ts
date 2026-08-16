import { Temporal } from "temporal-polyfill";
import { read, utils, type WorkBook } from "xlsx";

import type { SalesImportProblem } from "./sales-import-types";
import { createHash } from "node:crypto";

type CellValue = string | number | boolean | Date | null | undefined;
type RecordType = "sale_item" | "package_summary" | "exchange_summary";
const SALES_TIME_ZONE = "America/Sao_Paulo";
interface PackageContext {
  saleNumber: string;
  saleDate: string;
  remaining: number;
}

const REQUIRED_MARKERS = ["saleNumber", "saleDate", "status", "quantity", "productRevenue", "sku", "mlb", "total"];

const COLUMN_ALIASES = {
  saleNumber: ["N.º de venda", "Nº de venda", "N° de venda", "Número da venda"],
  saleDate: ["Data da venda"],
  status: ["Estado", "Status"],
  statusDescription: ["Descrição do estado", "Descrição do status"],
  quantity: ["Unidades", "Quantidade"],
  sku: ["SKU"],
  mlb: ["# de anúncio", "N.º do anúncio", "Nº do anúncio", "Número do anúncio", "ID do anúncio"],
  listingTitle: ["Título do anúncio", "Título"],
  variation: ["Variação"],
  listingTypeRaw: ["Tipo de anúncio"],
  unitPrice: [
    "Preço unitário de venda do anúncio (BRL)",
    "Preço unitário (BRL)",
    "Preço unitário",
    "Preço (BRL)",
    "Preço",
  ],
  grossAmount: ["Receita bruta (BRL)", "Receita bruta"],
  productRevenue: ["Receita por produtos (BRL)", "Receita por produtos"],
  additionalPriceRevenue: [
    "Receita por acréscimo no preço (pago pelo comprador)",
    "Receita por acréscimos no preço (BRL)",
    "Receita por acréscimos no preço",
  ],
  installmentFee: [
    "Taxa de parcelamento equivalente ao acréscimo",
    "Taxa por parcelamento (BRL)",
    "Taxa por parcelamento",
  ],
  saleFeeTax: ["Tarifa de venda e impostos (BRL)", "Tarifa de venda e impostos"],
  shippingRevenue: ["Receita por envio (BRL)", "Receita por envio"],
  shippingFee: ["Tarifas de envio (BRL)", "Tarifa de envio (BRL)", "Tarifa de envio"],
  exchangeShippingCost: [
    "Custo de envio por troca de produto",
    "Custo de envio por troca (BRL)",
    "Custo de envio por troca",
  ],
  declaredDimensionsShippingCost: [
    "Custo de envio com base nas medidas e peso declarados",
    "Custo de envio pelas dimensões declaradas (BRL)",
    "Custo de envio pelas dimensões declaradas",
  ],
  dimensionsDifferenceCost: [
    "Custo por diferenças nas medidas e no peso do pacote",
    "Custo por diferença nas dimensões (BRL)",
    "Custo por diferença nas dimensões",
  ],
  discountsBonuses: ["Descontos e bônus", "Descontos e bônus (BRL)"],
  cancellationsRefunds: ["Cancelamentos e reembolsos (BRL)", "Cancelamentos e reembolsos"],
  total: ["Total (BRL)", "Total"],
  billingMonth: ["Mês de faturamento das suas tarifas", "Mês de faturamento"],
  officialStore: ["Loja oficial"],
  shippingMethod: ["Forma de entrega", "Método de envio"],
  adsSale: ["Venda por publicidade"],
  multiProductPackage: ["Pacote de diversos produtos", "Pacote de vários produtos", "Pacote de múltiplos produtos"],
  belongsToKit: ["Pertence a um kit"],
} as const;

type ColumnKey = keyof typeof COLUMN_ALIASES;

export interface ParsedSaleRow {
  line: number;
  saleNumber: string;
  saleDate: string;
  saleStatus: string | null;
  statusDescription: string | null;
  quantity: number | null;
  skuRaw: string | null;
  mlbRaw: string | null;
  listingTitle: string | null;
  variation: string | null;
  listingTypeRaw: string | null;
  unitPrice: number | null;
  grossAmount: number | null;
  netAmount: number | null;
  productRevenue: number | null;
  additionalPriceRevenue: number | null;
  installmentFee: number | null;
  saleFeeTax: number | null;
  shippingRevenue: number | null;
  shippingFee: number | null;
  exchangeShippingCost: number | null;
  declaredDimensionsShippingCost: number | null;
  dimensionsDifferenceCost: number | null;
  discountsBonuses: number | null;
  cancellationsRefunds: number | null;
  billingMonth: string | null;
  officialStore: string | null;
  shippingMethod: string | null;
  adsSale: boolean | null;
  multiProductPackage: boolean | null;
  belongsToKit: boolean | null;
  packageParentSaleNumber: string | null;
  packageSize: number | null;
  recordType: RecordType;
  sourceRowHash: string;
}

export interface ParsedSalesFile {
  rows: ParsedSaleRow[];
  rowCount: number;
  problems: SalesImportProblem[];
  periodStart: string | null;
  periodEnd: string | null;
}

function normalizeHeader(value: CellValue): string {
  return cellText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("pt-BR");
}

function cellText(value: CellValue): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

export function parseBrazilianNumber(value: CellValue): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const original = cellText(value);
  if (!original) return null;

  let text = original.replace(/R\$/gi, "").replace(/\s/g, "");
  const parenthesized = /^\(.*\)$/.test(text);
  text = text.replace(/[()]/g, "");
  if (text.includes(",")) text = text.replace(/\./g, "").replace(",", ".");
  const parsed = Number(text);
  if (!Number.isFinite(parsed)) return null;
  return parenthesized ? -Math.abs(parsed) : parsed;
}

function parseInteger(value: CellValue): number | null {
  const parsed = parseBrazilianNumber(value);
  return parsed !== null && Number.isInteger(parsed) ? parsed : null;
}

function parseBoolean(value: CellValue): boolean | null {
  if (typeof value === "boolean") return value;
  const text = normalizeHeader(value);
  if (["sim", "s", "yes", "verdadeiro", "true"].includes(text)) return true;
  if (["nao", "n", "no", "falso", "false"].includes(text)) return false;
  return null;
}

export function normalizeMlb(value: CellValue): string | null {
  const text = cellText(value)
    .toUpperCase()
    .replace(/[\s.-]/g, "");
  if (!text) return null;
  const digits = text.replace(/^ML[AB]/, "").replace(/\D/g, "");
  return digits ? `MLB${digits}` : null;
}

export function parseBrazilianDate(value: CellValue): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return localDateTimeToIso(
      value.getUTCFullYear(),
      value.getUTCMonth() + 1,
      value.getUTCDate(),
      value.getUTCHours(),
      value.getUTCMinutes(),
      value.getUTCSeconds(),
    );
  }
  if (typeof value === "number") {
    const date = new Date(Date.UTC(1899, 11, 30) + value * 86_400_000);
    if (!Number.isNaN(date.getTime())) {
      return localDateTimeToIso(
        date.getUTCFullYear(),
        date.getUTCMonth() + 1,
        date.getUTCDate(),
        date.getUTCHours(),
        date.getUTCMinutes(),
        date.getUTCSeconds(),
      );
    }
  }
  const text = cellText(value);
  if (!text) return null;
  const textualMatch = text.match(
    /^(\d{1,2})\s+de\s+([\p{L}]+)\s+de\s+(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(?:h|hs)\.?)?$/iu,
  );
  if (textualMatch) {
    const months = [
      "janeiro",
      "fevereiro",
      "marco",
      "abril",
      "maio",
      "junho",
      "julho",
      "agosto",
      "setembro",
      "outubro",
      "novembro",
      "dezembro",
    ];
    const [, day, rawMonth, year, hour = "0", minute = "0", second = "0"] = textualMatch;
    const normalizedMonth = normalizeHeader(rawMonth);
    const month = months.indexOf(normalizedMonth);
    if (month < 0) return null;
    return localDateTimeToIso(Number(year), month + 1, Number(day), Number(hour), Number(minute), Number(second));
  }
  const match = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!match) return null;
  const [, day, month, year, hour = "0", minute = "0", second = "0"] = match;
  return localDateTimeToIso(Number(year), Number(month), Number(day), Number(hour), Number(minute), Number(second));
}

export function parseSalesExportedAt(fileName: string): string | null {
  const match = fileName.match(/(20\d{2})-(\d{2})-(\d{2})[_ -](\d{1,2})-(\d{2})hs?/i);
  if (!match) return null;

  const [, year, month, day, hour, minute] = match;
  try {
    const instant = Temporal.PlainDateTime.from({
      year: Number(year),
      month: Number(month),
      day: Number(day),
      hour: Number(hour),
      minute: Number(minute),
      second: 0,
    })
      .toZonedDateTime(SALES_TIME_ZONE)
      .toInstant();
    return new Date(Number(instant.epochMilliseconds)).toISOString();
  } catch {
    return null;
  }
}

function localDateTimeToIso(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
): string | null {
  try {
    const instant = Temporal.PlainDateTime.from({ year, month, day, hour, minute, second })
      .toZonedDateTime(SALES_TIME_ZONE)
      .toInstant();
    return new Date(Number(instant.epochMilliseconds)).toISOString();
  } catch {
    return null;
  }
}

function findColumns(row: CellValue[]): Map<ColumnKey, number> {
  const normalizedCells = row.map(normalizeHeader);
  const columns = new Map<ColumnKey, number>();
  for (const [key, aliases] of Object.entries(COLUMN_ALIASES) as [ColumnKey, readonly string[]][]) {
    const aliasSet = new Set(aliases.map(normalizeHeader));
    const index = normalizedCells.findIndex((cell) => aliasSet.has(cell));
    if (index >= 0) columns.set(key, index);
  }
  return columns;
}

function value(row: CellValue[], columns: Map<ColumnKey, number>, key: ColumnKey): CellValue {
  return row[columns.get(key) ?? -1];
}

function nullableText(value: CellValue): string | null {
  return cellText(value) || null;
}

function firstNonEmpty(...values: (string | null | undefined)[]): string {
  return values.find((entry) => entry !== null && entry !== undefined && entry !== "") ?? "";
}

function packageSize(status: string): number | null {
  const match = status.match(/pacote\s+de\s+(\d+)\s+produtos?/i);
  return match ? Number(match[1]) : null;
}

function identifyRecordType(status: string): RecordType {
  if (/pacote\s+de\s+\d+\s+produtos?/i.test(status)) return "package_summary";
  if (/venda\s+com\s+solicita[cç][aã]o\s+de\s+altera[cç][aã]o/i.test(status)) return "exchange_summary";
  if (/\b(troca|exchange)\b/i.test(status) && /\b(resumo|summary)\b/i.test(status)) return "exchange_summary";
  return "sale_item";
}

function currentPackage(context: PackageContext | null): PackageContext | null {
  return context;
}

function hashRow(row: Omit<ParsedSaleRow, "line" | "sourceRowHash">): string {
  const normalized = Object.fromEntries(
    Object.entries(row).map(([key, entry]) => [key, typeof entry === "string" ? entry.normalize("NFC").trim() : entry]),
  );
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

function workbookRows(workbook: WorkBook): CellValue[][] {
  for (const name of workbook.SheetNames) {
    const rows = utils.sheet_to_json<CellValue[]>(workbook.Sheets[name], { header: 1, raw: true, defval: null });
    if (rows.some((row) => REQUIRED_MARKERS.every((marker) => findColumns(row).has(marker as ColumnKey)))) return rows;
  }
  throw new Error("A linha de cabeçalho do relatório de vendas não foi encontrada.");
}

export function parseSalesWorkbook(workbook: WorkBook): ParsedSalesFile {
  const sourceRows = workbookRows(workbook);
  const headerIndex = sourceRows.findIndex((row) =>
    REQUIRED_MARKERS.every((marker) => findColumns(row).has(marker as ColumnKey)),
  );
  const columns = findColumns(sourceRows[headerIndex]);
  const problems: SalesImportProblem[] = [];
  const rows: ParsedSaleRow[] = [];
  let activePackage: PackageContext | null = null;

  for (let index = headerIndex + 1; index < sourceRows.length; index += 1) {
    const source = sourceRows[index];
    const line = index + 1;
    const sourceSaleNumber = cellText(value(source, columns, "saleNumber"));
    const status = cellText(value(source, columns, "status"));
    const skuRaw = nullableText(value(source, columns, "sku"));
    const mlbRaw = normalizeMlb(value(source, columns, "mlb"));
    const type = identifyRecordType(status);
    const size = type === "package_summary" ? packageSize(status) : null;
    const rawDate = value(source, columns, "saleDate");
    const sourceSaleDate = parseBrazilianDate(rawDate);
    const parentPackage = currentPackage(activePackage);
    const saleNumber = firstNonEmpty(sourceSaleNumber, parentPackage?.saleNumber);
    const saleDate: string | null = sourceSaleDate ?? parentPackage?.saleDate ?? null;
    const productRevenue = parseBrazilianNumber(value(source, columns, "productRevenue"));
    const explicitGross = parseBrazilianNumber(value(source, columns, "grossAmount"));
    const netAmount = parseBrazilianNumber(value(source, columns, "total"));
    const unitPrice = parseBrazilianNumber(value(source, columns, "unitPrice"));

    if (!sourceSaleNumber && !status && !skuRaw && !mlbRaw && !cellText(rawDate)) continue;
    if (!saleNumber) problems.push({ line, message: "N.º de venda vazio" });
    if (!saleDate) problems.push({ line, message: "Data da venda inválida" });
    const quantity = parseInteger(value(source, columns, "quantity"));
    if (type === "sale_item" && (quantity === null || quantity <= 0)) {
      problems.push({ line, message: "Unidades inválidas para item de venda" });
    }
    if (
      explicitGross === null &&
      productRevenue === null &&
      netAmount === null &&
      !activePackage &&
      unitPrice === null
    ) {
      problems.push({ line, message: "Linha sem valor financeiro para Receita bruta" });
    }

    const packageParentSaleNumber = type === "sale_item" && activePackage ? activePackage.saleNumber : null;
    const withoutHash: Omit<ParsedSaleRow, "line" | "sourceRowHash"> = {
      saleNumber,
      saleDate: saleDate ?? "",
      saleStatus: status || null,
      statusDescription: nullableText(value(source, columns, "statusDescription")),
      quantity,
      skuRaw: type === "package_summary" ? null : skuRaw,
      mlbRaw: type === "package_summary" ? null : mlbRaw,
      listingTitle: nullableText(value(source, columns, "listingTitle")),
      variation: nullableText(value(source, columns, "variation")),
      listingTypeRaw: nullableText(value(source, columns, "listingTypeRaw")),
      unitPrice,
      grossAmount: explicitGross,
      netAmount,
      productRevenue,
      additionalPriceRevenue: parseBrazilianNumber(value(source, columns, "additionalPriceRevenue")),
      installmentFee: parseBrazilianNumber(value(source, columns, "installmentFee")),
      saleFeeTax: parseBrazilianNumber(value(source, columns, "saleFeeTax")),
      shippingRevenue: parseBrazilianNumber(value(source, columns, "shippingRevenue")),
      shippingFee: parseBrazilianNumber(value(source, columns, "shippingFee")),
      exchangeShippingCost: parseBrazilianNumber(value(source, columns, "exchangeShippingCost")),
      declaredDimensionsShippingCost: parseBrazilianNumber(value(source, columns, "declaredDimensionsShippingCost")),
      dimensionsDifferenceCost: parseBrazilianNumber(value(source, columns, "dimensionsDifferenceCost")),
      discountsBonuses: parseBrazilianNumber(value(source, columns, "discountsBonuses")),
      cancellationsRefunds: parseBrazilianNumber(value(source, columns, "cancellationsRefunds")),
      billingMonth: nullableText(value(source, columns, "billingMonth")),
      officialStore: nullableText(value(source, columns, "officialStore")),
      shippingMethod: nullableText(value(source, columns, "shippingMethod")),
      adsSale: parseBoolean(value(source, columns, "adsSale")),
      multiProductPackage: parseBoolean(value(source, columns, "multiProductPackage")),
      belongsToKit: parseBoolean(value(source, columns, "belongsToKit")),
      packageParentSaleNumber,
      packageSize: size,
      recordType: type,
    };

    rows.push({ line, ...withoutHash, sourceRowHash: hashRow(withoutHash) });

    if (type === "package_summary" && size && saleDate) activePackage = { saleNumber, saleDate, remaining: size };
    else if (type === "sale_item" && activePackage) {
      activePackage.remaining -= 1;
      if (activePackage.remaining === 0) activePackage = null;
    } else if (type !== "sale_item") activePackage = null;
  }

  const validDates = rows
    .map((row) => row.saleDate.slice(0, 10))
    .filter(Boolean)
    .sort();
  return {
    rows,
    rowCount: rows.length,
    problems,
    periodStart: validDates[0] ?? null,
    periodEnd: validDates.at(-1) ?? null,
  };
}

export function parseSalesXlsx(buffer: Buffer): ParsedSalesFile {
  return parseSalesWorkbook(read(buffer, { type: "buffer", cellDates: true }));
}
