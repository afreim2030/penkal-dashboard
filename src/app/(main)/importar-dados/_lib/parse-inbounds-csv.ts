import { Temporal } from "temporal-polyfill";

import type { InboundsImportProblem } from "./inbounds-import-types";

const REQUIRED_HEADERS = [
  "ID do envio",
  "Status do envio",
  "Data de recebimento",
  "SKU",
  "Número do anúncio",
  "Unidades declaradas",
  "Unidades processadas",
  "Diferenças",
  "Unidades aptas para venda",
  "Unidades não aptas para venda",
  "Unidades para identificar",
] as const;

const TIME_ZONE = "America/Sao_Paulo";

export interface ParsedInboundRow {
  line: number;
  inboundId: string;
  statusRaw: string | null;
  receivedAt: string;
  skuRaw: string;
  mlbRaw: string | null;
  listingNumbers: string[];
  unitsDeclared: number | null;
  unitsProcessed: number | null;
  unitsDifference: number | null;
  unitsSellable: number | null;
  unitsUnsellable: number | null;
  unitsUnidentified: number | null;
}

export interface ParsedInboundsCsv {
  rows: ParsedInboundRow[];
  rowCount: number;
  duplicateRows: number;
  headers: string[];
  problems: InboundsImportProblem[];
}

function decodeCsv(buffer: Buffer): string {
  const utf8 = buffer.toString("utf8");
  if (utf8.includes("\uFFFD")) throw new Error("O CSV não possui uma codificação UTF-8 válida.");
  return utf8.replace(/^\uFEFF/, "");
}

function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const candidates = [";", ",", "\t"];
  const delimiter = candidates.sort((left, right) => firstLine.split(right).length - firstLine.split(left).length)[0];
  if (!delimiter || firstLine.split(delimiter).length < 2)
    throw new Error("Não foi possível identificar o delimitador do CSV.");
  return delimiter;
}

function csvRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else cell += character;
    } else if (character === '"') quoted = true;
    else if (character === delimiter) {
      row.push(cell);
      cell = "";
    } else if (character === "\n") {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cell = "";
    } else cell += character;
  }
  if (quoted) throw new Error("O CSV possui uma célula entre aspas não finalizada.");
  if (cell || row.length) {
    row.push(cell.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows;
}

function normalizedHeader(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim().toLocaleLowerCase("pt-BR");
}

function nullableText(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed || null;
}

function integer(value: string | undefined, allowNegative: boolean): number | null | undefined {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;
  if (!/^-?\d+$/.test(trimmed)) return undefined;
  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed) || (!allowNegative && parsed < 0)) return undefined;
  return parsed;
}

export function normalizeInboundMlbs(value: string | null): string[] {
  if (!value) return [];
  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const part of value.split("|")) {
    const compact = part
      .trim()
      .toUpperCase()
      .replace(/^ML[AB]/, "")
      .replace(/\D/g, "");
    if (!compact) continue;
    const mlb = `MLB${compact}`;
    if (!seen.has(mlb)) {
      seen.add(mlb);
      normalized.push(mlb);
    }
  }
  return normalized;
}

export function parseInboundReceivedAt(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{2}):(\d{2}):(\d{2}))?$/.exec(value.trim());
  if (!match) return null;
  try {
    const plain = Temporal.PlainDateTime.from({
      year: Number(match[1]),
      month: Number(match[2]),
      day: Number(match[3]),
      hour: Number(match[4] ?? 0),
      minute: Number(match[5] ?? 0),
      second: Number(match[6] ?? 0),
    });
    return plain.toZonedDateTime(TIME_ZONE).toInstant().toString();
  } catch {
    return null;
  }
}

export function inboundLogicalKey(row: Pick<ParsedInboundRow, "inboundId" | "skuRaw">): string {
  return `${row.inboundId}\u001f${row.skuRaw}`;
}

export function inboundRowsEquivalent(left: ParsedInboundRow, right: ParsedInboundRow): boolean {
  return (
    left.inboundId === right.inboundId &&
    left.skuRaw === right.skuRaw &&
    left.receivedAt === right.receivedAt &&
    left.statusRaw === right.statusRaw &&
    left.mlbRaw === right.mlbRaw &&
    JSON.stringify(left.listingNumbers) === JSON.stringify(right.listingNumbers) &&
    left.unitsDeclared === right.unitsDeclared &&
    left.unitsProcessed === right.unitsProcessed &&
    left.unitsDifference === right.unitsDifference &&
    left.unitsSellable === right.unitsSellable &&
    left.unitsUnsellable === right.unitsUnsellable &&
    left.unitsUnidentified === right.unitsUnidentified
  );
}

export function parseInboundsCsv(buffer: Buffer): ParsedInboundsCsv {
  const text = decodeCsv(buffer);
  const delimiter = detectDelimiter(text);
  const sourceRows = csvRows(text, delimiter);
  if (sourceRows.length === 0) throw new Error("O CSV está vazio.");
  const headers = sourceRows[0].map((header) => header.trim());
  const headerIndexes = new Map(headers.map((header, index) => [normalizedHeader(header), index]));
  const missing = REQUIRED_HEADERS.filter((header) => !headerIndexes.has(normalizedHeader(header)));
  if (missing.length) throw new Error(`Cabeçalhos obrigatórios ausentes: ${missing.join(", ")}.`);

  const column = (name: (typeof REQUIRED_HEADERS)[number]) => headerIndexes.get(normalizedHeader(name)) as number;
  const problems: InboundsImportProblem[] = [];
  const rows: ParsedInboundRow[] = [];
  const logicalRows = new Map<string, ParsedInboundRow>();
  const conflictingKeys = new Set<string>();
  let duplicateRows = 0;
  const dataRows = sourceRows.slice(1).filter((row) => row.some((cell) => cell.trim()));

  dataRows.forEach((source, index) => {
    const line = index + 2;
    const inboundId = source[column("ID do envio")]?.trim() ?? "";
    const skuRaw = source[column("SKU")]?.trim() ?? "";
    const receivedRaw = source[column("Data de recebimento")]?.trim() ?? "";
    const receivedAt = parseInboundReceivedAt(receivedRaw);
    const quantityFields = [
      ["Unidades declaradas", "unitsDeclared", false],
      ["Unidades processadas", "unitsProcessed", false],
      ["Diferenças", "unitsDifference", true],
      ["Unidades aptas para venda", "unitsSellable", false],
      ["Unidades não aptas para venda", "unitsUnsellable", false],
      ["Unidades para identificar", "unitsUnidentified", false],
    ] as const;
    const quantities = Object.fromEntries(
      quantityFields.map(([header, property, allowNegative]) => [
        property,
        integer(source[column(header)], allowNegative),
      ]),
    ) as Record<(typeof quantityFields)[number][1], number | null | undefined>;
    const errors: string[] = [];
    if (!inboundId) errors.push("ID do envio vazio");
    if (!skuRaw) errors.push("SKU vazio");
    if (!receivedAt) errors.push(`Data de recebimento inválida: ${receivedRaw || "vazia"}`);
    for (const [header, property, allowNegative] of quantityFields) {
      if (quantities[property] === undefined) {
        errors.push(`Quantidade inválida em ${header}${allowNegative ? "" : " (deve ser zero ou positiva)"}`);
      }
    }
    if (errors.length) {
      problems.push(...errors.map((message) => ({ line, message, severity: "error" as const })));
      return;
    }

    const mlbRaw = nullableText(source[column("Número do anúncio")]);
    const row: ParsedInboundRow = {
      line,
      inboundId,
      statusRaw: nullableText(source[column("Status do envio")]),
      receivedAt: receivedAt as string,
      skuRaw,
      mlbRaw,
      listingNumbers: normalizeInboundMlbs(mlbRaw),
      unitsDeclared: quantities.unitsDeclared as number | null,
      unitsProcessed: quantities.unitsProcessed as number | null,
      unitsDifference: quantities.unitsDifference as number | null,
      unitsSellable: quantities.unitsSellable as number | null,
      unitsUnsellable: quantities.unitsUnsellable as number | null,
      unitsUnidentified: quantities.unitsUnidentified as number | null,
    };
    const key = inboundLogicalKey(row);
    if (conflictingKeys.has(key)) {
      problems.push({
        line,
        message: `Conflito histórico no arquivo para envio ${inboundId} e SKU ${skuRaw}`,
        severity: "error",
      });
      return;
    }
    const previous = logicalRows.get(key);
    if (previous) {
      if (inboundRowsEquivalent(previous, row)) {
        duplicateRows += 1;
        problems.push({
          line,
          message: `Linha duplicada equivalente para envio ${inboundId} e SKU ${skuRaw}`,
          severity: "warning",
        });
      } else {
        logicalRows.delete(key);
        rows.splice(rows.indexOf(previous), 1);
        conflictingKeys.add(key);
        problems.push({
          line,
          message: `Conflito histórico no arquivo para envio ${inboundId} e SKU ${skuRaw}`,
          severity: "error",
        });
      }
      return;
    }
    logicalRows.set(key, row);
    rows.push(row);
  });

  return { rows, rowCount: dataRows.length, duplicateRows, headers, problems };
}
