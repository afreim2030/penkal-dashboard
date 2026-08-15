import {
  consolidateInboundsResults,
  inboundDatabaseValues,
  inboundsFileHash,
  inboundsRetryMessage,
} from "../app/(main)/importar-dados/_lib/import-inbounds";
import type { InboundsFileImportResult } from "../app/(main)/importar-dados/_lib/inbounds-import-types";
import {
  inboundLogicalKey,
  inboundRowsEquivalent,
  normalizeInboundMlbs,
  parseInboundReceivedAt,
  parseInboundsCsv,
} from "../app/(main)/importar-dados/_lib/parse-inbounds-csv";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const headers = [
  "ID do envio",
  "Status do envio",
  "Data de recebimento",
  "Código ML",
  "Código universal",
  "SKU",
  "Número do anúncio",
  "Variações",
  "Unidades declaradas",
  "Unidades processadas",
  "Diferenças",
  "Unidades aptas para venda",
  "Unidades não aptas para venda",
  "Unidades para identificar",
  "Data do download do detalhe",
];

function csv(rows: Array<Array<string | number | null>>): Buffer {
  return Buffer.from([headers, ...rows].map((row) => row.map((value) => value ?? "").join(";")).join("\r\n"));
}

function optionOrDefault<T>(value: T | undefined, defaultValue: T): T {
  if (value === undefined) return defaultValue;
  return value;
}

function row(
  inboundId: string,
  sku: string,
  options: {
    date?: string;
    mlb?: string;
    declared?: string | number | null;
    processed?: string | number | null;
    difference?: string | number | null;
    sellable?: string | number | null;
    unsellable?: string | number | null;
    unidentified?: string | number | null;
    download?: string;
  } = {},
): Array<string | number | null> {
  return [
    inboundId,
    "Processado com diferenças",
    options.date ?? "2026-02-12 22:16:12",
    "CODE",
    "",
    sku,
    options.mlb ?? "5166882296",
    "",
    optionOrDefault(options.declared, 10),
    optionOrDefault(options.processed, 9),
    optionOrDefault(options.difference, -1),
    optionOrDefault(options.sellable, 8),
    optionOrDefault(options.unsellable, 1),
    optionOrDefault(options.unidentified, 0),
    options.download ?? "2026-08-11 10:56:57",
  ];
}

// 1–3: envio válido, vários SKUs no mesmo envio e mesmo SKU em envios distintos.
const parsed = parseInboundsCsv(csv([row("71566195", "SKU-1"), row("71566195", "SKU-2"), row("80000000", "SKU-1")]));
assert.equal(parsed.rows.length, 3);
assert.equal(new Set(parsed.rows.map((item) => item.inboundId)).size, 2);
assert.equal(parsed.rows.filter((item) => item.inboundId === "71566195").length, 2);
assert.equal(parsed.rows.filter((item) => item.skuRaw === "SKU-1").length, 2);

// 4–9: vínculos opcionais, MLB único/múltiplo e preservação das duas semânticas.
const single = parsed.rows[0];
const linked = inboundDatabaseValues(single, { productId: "product-1", listingId: "listing-1", sourceFile: "a.csv" });
const unknown = inboundDatabaseValues(single, { productId: null, listingId: null, sourceFile: "a.csv" });
assert.equal(linked.product_id, "product-1");
assert.equal(linked.listing_id, "listing-1");
assert.equal(unknown.product_id, null);
assert.equal(unknown.listing_id, null);
const multiple = parseInboundsCsv(csv([row("1", "SKU", { mlb: "5166882296 | 5662845348" })])).rows[0];
assert.equal(multiple.mlbRaw, "5166882296 | 5662845348");
assert.deepEqual(multiple.listingNumbers, ["MLB5166882296", "MLB5662845348"]);
assert.equal(
  inboundDatabaseValues(multiple, { productId: null, listingId: null, sourceFile: "b.csv" }).listing_id,
  null,
);
assert.deepEqual(normalizeInboundMlbs(" MLB5166882296 | 5662845348 | MLB5166882296 "), [
  "MLB5166882296",
  "MLB5662845348",
]);

// 10–14: zero, vazio, inválido, diferença negativa e unidades para identificar.
const quantities = parseInboundsCsv(
  csv([
    row("1", "ZERO", { declared: 0, processed: null, difference: -10, sellable: 0, unsellable: 0, unidentified: 3 }),
    row("2", "INVALID", { processed: "abc" }),
    row("3", "NEGATIVE", { unidentified: -1 }),
  ]),
);
assert.equal(quantities.rows[0].unitsDeclared, 0);
assert.equal(quantities.rows[0].unitsProcessed, null);
assert.equal(quantities.rows[0].unitsDifference, -10);
assert.equal(quantities.rows[0].unitsUnidentified, 3);
assert.ok(quantities.problems.some((problem) => problem.message.includes("Unidades processadas")));
assert.ok(quantities.problems.some((problem) => problem.message.includes("Unidades para identificar")));

// 15–18: duplicação dentro/entre arquivos, equivalência e conflito histórico.
const duplicate = parseInboundsCsv(csv([row("1", "SKU"), row("1", "SKU")]));
assert.equal(duplicate.rowCount, 2);
assert.equal(duplicate.rows.length, 1);
assert.equal(duplicate.duplicateRows, 1);
assert.equal(duplicate.problems[0].severity, "warning");
const firstFile = parseInboundsCsv(csv([row("1", "SKU")])).rows[0];
const secondFile = parseInboundsCsv(csv([row("1", "SKU")])).rows[0];
const conflict = parseInboundsCsv(csv([row("1", "SKU", { processed: 8 })])).rows[0];
assert.equal(inboundLogicalKey(firstFile), inboundLogicalKey(secondFile));
assert.equal(inboundRowsEquivalent(firstFile, secondFile), true);
assert.equal(inboundRowsEquivalent(firstFile, conflict), false);

// 19–21: SHA-256 e política de retry.
const bytes = Buffer.from("mesmo arquivo de envios FULL");
assert.equal(inboundsFileHash(bytes), inboundsFileHash(bytes));
assert.equal(inboundsRetryMessage("completed"), "Este arquivo já foi importado anteriormente.");
assert.equal(inboundsRetryMessage("processing"), "Uma importação deste arquivo já está em andamento.");
assert.equal(inboundsRetryMessage("failed"), null);
assert.equal(inboundsRetryMessage("completed_with_errors"), null);

// 22–23: fuso de São Paulo e independência da data de download.
assert.equal(parseInboundReceivedAt("2026-02-12 22:16:12"), "2026-02-13T01:16:12Z");
const downloadA = parseInboundsCsv(csv([row("1", "SKU", { download: "2020-01-01 00:00:00" })])).rows[0];
const downloadB = parseInboundsCsv(csv([row("1", "SKU", { download: "2030-01-01 00:00:00" })])).rows[0];
assert.equal(downloadA.receivedAt, downloadB.receivedAt);

// 24–26: o importador não toca no estoque atual nem cria produtos/anúncios.
const importerSource = readFileSync(
  resolve(process.cwd(), "src/app/(main)/importar-dados/_lib/import-inbounds.ts"),
  "utf8",
);
assert.doesNotMatch(importerSource, /from\("full_inventory_snapshots"\)/);
assert.doesNotMatch(importerSource, /from\("products"\)\.insert/);
assert.doesNotMatch(importerSource, /from\("listings"\)\.insert/);

// 27–28: múltiplos arquivos consolidados e processamento individual em imports.
function result(fileName: string, inboundId: string): InboundsFileImportResult {
  return {
    fileName,
    success: true,
    duplicateFile: false,
    inboundIds: [inboundId],
    recordsProcessed: 1,
    insertedRows: 1,
    existingRows: 0,
    historicalConflicts: 0,
    identifiedSkus: 1,
    unidentifiedSkus: 0,
    identifiedMlbs: 1,
    unidentifiedMlbs: 0,
    unitsDeclared: 10,
    unitsProcessed: 9,
    unitsDifference: -1,
    unitsSellable: 8,
    unitsUnsellable: 1,
    unitsUnidentified: 0,
    errors: 0,
    problems: [],
  };
}
const consolidated = consolidateInboundsResults([result("a.csv", "1"), result("b.csv", "2")]);
assert.equal(consolidated.filesProcessed, 2);
assert.equal(consolidated.inboundIds, 2);
assert.equal(consolidated.recordsProcessed, 2);
const routeSource = readFileSync(resolve(process.cwd(), "src/app/api/importacoes/inbounds/route.ts"), "utf8");
assert.match(routeSource, /for \(const file of files\)/);
assert.match(routeSource, /await importInboundsFile/);
assert.match(importerSource, /import_type: "full_inbounds"/);

// Migration mínima, sem restrição indevida para units_difference.
const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260815120000_completa_historico_envios_full.sql"),
  "utf8",
);
assert.match(migration, /units_unidentified is null or units_unidentified >= 0/);
assert.doesNotMatch(migration, /units_difference\s*>=\s*0/);
assert.match(migration, /full_inbounds_listing_id_idx/);

// Prova real em memória nos 14 CSVs.
const realDirectory = resolve(process.cwd(), "arquivos-envios-full");
const realFiles = readdirSync(realDirectory)
  .filter((file) => file.endsWith(".csv"))
  .sort();
const realRows = realFiles.flatMap((file) => parseInboundsCsv(readFileSync(resolve(realDirectory, file))).rows);
const realKeys = new Set(realRows.map(inboundLogicalKey));
const realSkus = new Set(realRows.map((item) => item.skuRaw));
const realMlbs = new Set(realRows.flatMap((item) => item.listingNumbers));
const realInbounds = new Set(realRows.map((item) => item.inboundId));
const sum = (
  property:
    | "unitsDeclared"
    | "unitsProcessed"
    | "unitsDifference"
    | "unitsSellable"
    | "unitsUnsellable"
    | "unitsUnidentified",
) => realRows.reduce((total, item) => total + (item[property] ?? 0), 0);
const dates = realRows.map((item) => item.receivedAt).sort();
assert.equal(realFiles.length, 14);
assert.equal(realRows.length, 631);
assert.equal(realKeys.size, 631);
assert.equal(realInbounds.size, 14);
assert.equal(realSkus.size, 190);
assert.equal(realMlbs.size, 327);
assert.equal(sum("unitsDeclared"), 46_394);
assert.equal(sum("unitsProcessed"), 46_306);
assert.equal(sum("unitsDifference"), -88);
assert.equal(sum("unitsSellable"), 46_306);
assert.equal(sum("unitsUnsellable"), 0);
assert.equal(sum("unitsUnidentified"), 0);
assert.equal(dates[0], "2026-02-13T01:16:12Z");
assert.equal(dates.at(-1), "2026-07-28T00:01:42Z");

console.log(
  "Envios FULL validados: 14 arquivos, 14 envios, 631 linhas únicas, 190 SKUs, 327 MLBs e 46.394 unidades declaradas.",
);
