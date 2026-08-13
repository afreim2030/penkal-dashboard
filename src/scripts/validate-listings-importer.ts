import { utils } from "xlsx";

import {
  classifyListingMlbs,
  retryMessageForStatus,
  sha256File,
} from "../app/(main)/importar-dados/_lib/import-listings";
import { parseListingsWorkbook } from "../app/(main)/importar-dados/_lib/parse-listings-xlsx";
import assert from "node:assert/strict";

const headers = ["FAMILY_ID", "ITEM_ID", "SKU", "TITLE", "STOCK_FULL", "PRICE", "LISTING_TYPE", "STATUS"];
const workbook = utils.book_new();
const sheet = utils.aoa_to_sheet([
  ["Relatório de anúncios"],
  ["Gerado pelo Mercado Livre"],
  headers,
  ["Identificador da família", "Identificador do anúncio", "Código do produto", "Título", "Estoque", "Preço"],
  [null, "MLB5662845348", "30925", "Anúncio principal", 97, 29.9, "Clássico", "Ativo"],
  [null, "MLB5166882296", "30925", "Anúncio secundário", 12, "31,90", "Premium", "Inativo"],
  [null, "MLB5000000001", null, "Sem SKU", 5, 10, "Clássico", "Ativo"],
  [null, null, "40000", "Sem MLB", 7, 15, "Clássico", "Ativo"],
]);
utils.book_append_sheet(workbook, sheet, "Anúncios");

const parsed = parseListingsWorkbook(workbook);
const validRows = parsed.rows.filter((row) => !parsed.problems.some((problem) => problem.line === row.line));
const products = new Set(validRows.map((row) => row.sku));
const listings = new Set(validRows.map((row) => row.mlb));

assert.equal(products.size, 1, "um SKU deve identificar um único produto");
assert.equal(listings.size, 2, "o mesmo SKU pode ter dois MLBs");
assert.deepEqual(classifyListingMlbs([...listings], new Set(["MLB5662845348"])), { created: 1, updated: 1 });
assert.ok(parsed.problems.some((problem) => problem.message === "SKU vazio"));
assert.ok(parsed.problems.some((problem) => problem.message === "ITEM_ID vazio"));
assert.equal(sha256File(Buffer.from("arquivo")), sha256File(Buffer.from("arquivo")), "hash repetido deve ser idêntico");
assert.equal(retryMessageForStatus("completed"), "Este arquivo já foi importado anteriormente.");
assert.equal(retryMessageForStatus("processing"), "Uma importação deste arquivo já está em andamento.");
assert.equal(retryMessageForStatus("failed"), null, "failed deve permitir retentativa");
assert.equal(retryMessageForStatus("completed_with_errors"), null, "completed_with_errors deve permitir retentativa");
assert.equal(parsed.rowCount, 4, "linhas auxiliares devem ser ignoradas");
assert.equal(parsed.rows[0].price, 29.9, "PRICE numérico deve ser preservado");
assert.equal(parsed.rows[1].price, 31.9, "PRICE decimal brasileiro deve ser normalizado");
assert.deepEqual(
  parsed.rows.slice(0, 2).map((row) => row.status),
  ["Ativo", "Inativo"],
);
assert.equal(parsed.rows[0].stockFull, 97, "STOCK_FULL pode ser lido somente como referência");
assert.ok(!("quantityFull" in parsed.rows[0]), "o parser não deve criar um snapshot de estoque");

console.log("Validações do importador de anúncios concluídas com sucesso.");
