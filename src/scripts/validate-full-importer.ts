import { utils } from "xlsx";

import {
  fullInventoryFileHash,
  fullInventoryRetryMessage,
  fullInventorySnapshotRow,
  snapshotDateInSaoPaulo,
} from "../app/(main)/importar-dados/_lib/import-full-inventory";
import {
  normalizeFullMlbs,
  parseFullInventoryWorkbook,
  parseFullInventoryXlsx,
} from "../app/(main)/importar-dados/_lib/parse-full-inventory-xlsx";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type TestRow = Array<string | number | null>;

const headers = [
  "Código ML",
  "SKU",
  "# Anúncio",
  "Produto",
  "Unidades que afetam a métrica de Tempo de estoque",
  "Vendas últimos 30 dias (un.)",
  "Unidades no Full",
  null,
  null,
  null,
  null,
  "Unidades que ocupam espaço no Full",
  "Estoque físico",
];
const subheaders = [
  null,
  null,
  null,
  null,
  null,
  null,
  "Aptas",
  "Não aptas",
  "Extraviadas",
  "Em revisão",
  "Canceladas",
];

function workbook(dataRows: TestRow[]) {
  const book = utils.book_new();
  const sheet = utils.aoa_to_sheet([
    ["Relatório geral de estoque"],
    ["Atualizado em 11 de agosto às 10h12."],
    ["Metadata antes do cabeçalho"],
    headers,
    subheaders,
    [null, null, null, null, null, null, null, null, null, null, null],
    ...dataRows,
    [null, null, null, null, null, null, null, null, null, null, null, 9999],
  ]);
  sheet["!merges"] = [{ s: { r: 3, c: 6 }, e: { r: 3, c: 10 } }];
  utils.book_append_sheet(book, sheet, "Resumo");
  utils.book_append_sheet(book, utils.aoa_to_sheet([["Não importar"], ["SKU-X", 99999]]), "Boa qualidade");
  return book;
}

const validRows: TestRow[] = [
  ["CODE-1", "SKU-1", "3870912609 | 6170181744", "Produto 1", 7, 3, 5, 0, 1, 0, 0, 6009, 500],
  ["CODE-2", "SKU-2", "5149119266", "Produto 2", 0, 0, 0, 0, 0, 0, 0, 7777, 800],
];
const parsed = parseFullInventoryWorkbook(workbook(validRows));

// 1–4, 9–11, 16–17, 21, 24–25: identidade, quantidades, metadata, total e fontes proibidas.
assert.equal(parsed.headerLine, 4);
assert.equal(parsed.rowCount, 2);
assert.equal(parsed.rows[0].skuRaw, "SKU-1");
assert.equal(parsed.rows[1].skuRaw, "SKU-2");
assert.equal(parsed.rows[0].quantityFull, 6);
assert.equal(parsed.rows[1].quantityFull, 0);
assert.equal(parsed.rows[0].unitsAffectStockTime, 7);
assert.equal(
  parsed.rows.reduce((total, row) => total + row.quantityFull, 0),
  6,
);
assert.deepEqual(parsed.rows[0].mlbs, ["MLB3870912609", "MLB6170181744"]);
assert.equal(parsed.rows[0].mlbRaw, "MLB3870912609 | MLB6170181744");
assert.equal(parsed.rows.length, 2, "MLBs múltiplos não podem criar linhas extras");
assert.equal(parsed.rows[0].quantityFull, 6, "a quantidade não pode ser duplicada ou dividida por MLB");
assert.notEqual(parsed.rows[0].quantityFull, 6009, "Unidades que ocupam espaço não são quantity_full");
assert.notEqual(parsed.rows[0].quantityFull, 500, "estoque físico não pode ser utilizado");
assert.equal(parsed.problems.length, 0);

// 5–8: quantidade vazia/negativa, SKU vazio e SKU duplicado são erros reais.
const invalid = parseFullInventoryWorkbook(
  workbook([
    ["A", "EMPTY-QTY", "1", "Produto", 0, 0, null, 0, 0, 0, 0],
    ["B", "NEGATIVE", "2", "Produto", 0, 0, -1, 0, 0, 0, 0],
    ["C", null, "3", "Produto", 0, 0, 1, 0, 0, 0, 0],
    ["D", "DUP", "4", "Produto", 0, 0, 1, 0, 0, 0, 0],
    ["E", "DUP", "5", "Produto", 0, 0, 1, 0, 0, 0, 0],
  ]),
);
assert.ok(invalid.problems.some((problem) => problem.message.includes("Quantidade vazia")));
assert.ok(invalid.problems.some((problem) => problem.message.includes("Quantidade negativa")));
assert.ok(invalid.problems.some((problem) => problem.message === "SKU vazio"));
assert.ok(invalid.problems.some((problem) => problem.message.includes("SKU duplicado")));

// 2, 18–23: vínculo opcional, timestamp comum, data local, produto não criado e listing_id sempre nulo.
const snapshotAt = "2026-08-15T02:30:00.000Z";
const linked = fullInventorySnapshotRow(parsed.rows[0], {
  importId: "import-1",
  snapshotAt,
  productId: "product-1",
  listingId: "listing-1",
  sourceFile: "FULL.xlsx",
});
const unlinked = fullInventorySnapshotRow(parsed.rows[1], {
  importId: "import-1",
  snapshotAt,
  productId: null,
  listingId: null,
  sourceFile: "FULL.xlsx",
});
assert.equal(linked.product_id, "product-1");
assert.equal(unlinked.product_id, null);
assert.equal(linked.listing_id, "listing-1");
assert.equal(unlinked.listing_id, null);
assert.equal(linked.snapshot_at, unlinked.snapshot_at);
assert.equal(linked.snapshot_at, snapshotAt);
assert.equal(linked.snapshot_date, "2026-08-14");
assert.equal(snapshotDateInSaoPaulo(snapshotAt), "2026-08-14");
assert.equal("name" in unlinked, false, "o snapshot não pode criar produto automaticamente");

// 12–15: hash, bloqueios e limpeza estritamente pelo import_id no retry.
const bytes = Buffer.from("mesmo arquivo FULL");
assert.equal(fullInventoryFileHash(bytes), fullInventoryFileHash(bytes));
assert.equal(fullInventoryRetryMessage("completed"), "Este arquivo já foi importado anteriormente.");
assert.equal(fullInventoryRetryMessage("processing"), "Uma importação deste arquivo já está em andamento.");
assert.equal(fullInventoryRetryMessage("failed"), null);
assert.equal(fullInventoryRetryMessage("completed_with_errors"), null);
const importerSource = readFileSync(
  resolve(process.cwd(), "src/app/(main)/importar-dados/_lib/import-full-inventory.ts"),
  "utf8",
);
assert.match(importerSource, /from\("full_inventory_snapshots"\)\.delete\(\)\.eq\("import_id", existing\.id\)/);
assert.doesNotMatch(importerSource, /from\("products"\)\.insert/);
assert.match(importerSource, /row\.mlbs\.length === 1/);

// Arquivo real: critérios críticos definidos para a fotografia atual.
const realPath = resolve(process.cwd(), "FULL(1).xlsx");
const real = parseFullInventoryXlsx(readFileSync(realPath));
const uniqueSkus = new Set(real.rows.map((row) => row.skuRaw));
const uniqueMlbs = new Set(real.rows.flatMap((row) => row.mlbs));
const sorted = [...real.rows].sort((left, right) => right.quantityFull - left.quantityFull);
assert.equal(real.rowCount, 154);
assert.equal(real.rows.length, 154);
assert.equal(uniqueSkus.size, 154);
assert.equal(real.rows.length - uniqueSkus.size, 0);
assert.equal(uniqueMlbs.size, 263);
assert.equal(real.rows.filter((row) => row.quantityFull > 0).length, 114);
assert.equal(real.rows.filter((row) => row.quantityFull === 0).length, 40);
assert.equal(
  real.rows.reduce((total, row) => total + row.quantityFull, 0),
  4052,
);
assert.equal(
  real.rows.reduce((total, row) => total + (row.unitsAffectStockTime ?? 0), 0),
  418,
);
assert.equal(sorted[0].quantityFull, 167);
assert.equal(sorted[0].skuRaw, "30759");
assert.deepEqual(
  sorted.slice(0, 10).map((row) => [row.skuRaw, row.quantityFull]),
  [
    ["30759", 167],
    ["30423", 165],
    ["30628", 148],
    ["30617", 141],
    ["30228", 133],
    ["25105", 130],
    ["34697", 123],
    ["30985", 120],
    ["30925", 97],
    ["34575", 85],
  ],
);
assert.deepEqual(normalizeFullMlbs("3870912609 | MLB6170181744"), ["MLB3870912609", "MLB6170181744"]);

console.log("Importador FULL validado: 154 SKUs, 263 MLBs e 4.052 unidades no arquivo real.");
