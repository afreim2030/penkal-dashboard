import { utils } from "xlsx";

import { salesFileHash, salesRetryMessage } from "../app/(main)/importar-dados/_lib/import-sales";
import {
  normalizeMlb,
  parseBrazilianDate,
  parseBrazilianNumber,
  parseSalesWorkbook,
} from "../app/(main)/importar-dados/_lib/parse-sales-xlsx";
import assert from "node:assert/strict";

const headers = [
  "N.º de venda",
  "Data da venda",
  "Estado",
  "Descrição do estado",
  "Unidades",
  "Receita por produtos",
  "SKU",
  "# de anúncio",
  "Título do anúncio",
  "Total",
  "Cancelamentos e reembolsos",
  "Venda por publicidade",
  "Nome do comprador",
  "CPF",
  "E-mail",
  "Preço unitário (BRL)",
];

const source = [
  ["Relatório de vendas"],
  ["Período", "01/08/2026 a 31/08/2026"],
  ["Gerado pelo Mercado Livre"],
  headers,
  [
    "100",
    "11/08/2026 14:43",
    "Aprovada",
    "",
    1,
    "R$ 1.234,56",
    "SKU-1",
    "1102986048",
    "Produto A",
    "1.100,00",
    "",
    "Sim",
    "Maria",
    "000.000.000-00",
    "maria@example.com",
    "R$ 99,90",
  ],
  ["101", "12/08/2026", "Aprovada", "", 2, "20,00", "SKU-1", "MLB1102986048", "Produto A", "18,00", "", "Não"],
  ["102", "13/08/2026", "Aprovada", "", 1, "30,00", "SKU-1", "MLB1102986048", "Produto A", "27,00", "", "Sim"],
  ["102", "13/08/2026", "Aprovada", "", 1, "40,00", "SKU-2", "MLB2200000000", "Produto B", "36,00", "", "Não"],
  ["200", "14/08/2026", "Pacote de 2 produtos", "", null, "100,00", null, null, "", "90,00", "", ""],
  [null, null, "Aprovada", "", 1, "60,00", "SKU-1", "MLB1102986048", "Produto A", "", "", "Não"],
  [null, null, "Aprovada", "", 1, "40,00", "SKU-2", "MLB2200000000", "Produto B", "", "", "Sim"],
  [
    "300",
    "15/08/2026",
    "Cancelada",
    "Reembolso integral",
    1,
    "50,00",
    "SKU-X",
    "MLB9999999999",
    "Produto X",
    "0,00",
    "R$ -50,00",
    "Desconhecido",
  ],
  ["400", "16/08/2026", "Resumo de troca", "Troca solicitada", null, "-10,50", null, null, "", "-10,50", "", ""],
  ["401", "16/08/2026", "Venda com solicitação de alteração", "", null, "10,00", null, null, "", "9,00", "", ""],
];

function workbook() {
  const book = utils.book_new();
  utils.book_append_sheet(book, utils.aoa_to_sheet(source), "Vendas BR");
  return book;
}

function grossAmountWorkbook() {
  const book = utils.book_new();
  utils.book_append_sheet(
    book,
    utils.aoa_to_sheet([
      [
        "N.º de venda",
        "Data da venda",
        "Estado",
        "Unidades",
        "Receita por produtos",
        "Receita bruta",
        "SKU",
        "# de anúncio",
        "Total",
        "Preço unitário",
      ],
      ["500", "11/08/2026", "Aprovada", 1, null, null, "SKU-1", "MLB1", null, 10],
      ["501", "11/08/2026", "Aprovada", 1, 0, 0, "SKU-1", "MLB1", 0, 10],
      ["502", "11/08/2026", "Cancelada", 1, -10, -10, "SKU-1", "MLB1", -10, 10],
    ]),
    "Vendas BR",
  );
  return book;
}

const parsed = parseSalesWorkbook(workbook());
const items = parsed.rows.filter((row) => row.recordType === "sale_item");
const packageRow = parsed.rows.find((row) => row.recordType === "package_summary");
const exchangeRow = parsed.rows.find((row) => row.recordType === "exchange_summary");

// 1–3: venda normal, SKU repetido e uma venda com dois produtos.
assert.equal(items[0].skuRaw, "SKU-1");
assert.equal(items[0].mlbRaw, "MLB1102986048");
assert.equal(items.filter((row) => row.skuRaw === "SKU-1").length, 4);
assert.equal(new Set(items.filter((row) => row.saleNumber === "102").map((row) => row.skuRaw)).size, 2);

// 4–5 e 8: resumo + filhos, financeiro consolidado separado e identidade vazia no resumo.
assert.ok(packageRow);
assert.equal(packageRow.packageSize, 2);
assert.equal(packageRow.skuRaw, null);
assert.equal(packageRow.mlbRaw, null);
const packageItems = items.filter((row) => row.packageParentSaleNumber === "200");
assert.equal(packageItems.length, 2);
assert.ok(packageItems.every((row) => row.saleNumber === "200"));
assert.equal(packageRow.netAmount, 90);
assert.equal(packageRow.grossAmount, null);
assert.ok(packageItems.every((row) => row.grossAmount === null));
assert.equal(
  packageItems.reduce((total, row) => total + (row.netAmount ?? 0), 0),
  0,
);

// 6–7: a resolução mantém desconhecidos nulos sem perder os valores originais.
const knownSkus = new Set(["SKU-1", "SKU-2"]);
const knownMlbs = new Set(["MLB1102986048", "MLB2200000000"]);
const unknown = items.find((row) => row.saleNumber === "300");
assert.ok(unknown);
assert.equal(knownSkus.has(unknown.skuRaw ?? ""), false);
assert.equal(knownMlbs.has(unknown.mlbRaw ?? ""), false);
assert.equal(unknown.skuRaw, "SKU-X");
assert.equal(unknown.mlbRaw, "MLB9999999999");

// 9–13: monetários, negativos, reembolso e publicidade sem inferência.
assert.equal(parseBrazilianNumber("R$ 1.234,56"), 1234.56);
assert.equal(parseBrazilianNumber("1.234,56"), 1234.56);
assert.equal(parseBrazilianNumber("R$ -10,50"), -10.5);
assert.equal(parseBrazilianNumber("10.50"), 10.5);
assert.equal(parseBrazilianNumber(""), null);
assert.equal(parseBrazilianNumber(0), 0);
const grossAmountRows = parseSalesWorkbook(grossAmountWorkbook()).rows;
assert.equal(grossAmountRows[0].grossAmount, null);
assert.equal(grossAmountRows[1].grossAmount, 0);
assert.equal(grossAmountRows[2].grossAmount, -10);
assert.equal(unknown.cancellationsRefunds, -50);
assert.equal(items[0].adsSale, true);
assert.equal(items[1].adsSale, false);
assert.equal(packageRow.adsSale, null);
assert.equal(unknown.adsSale, null);
assert.equal(items[0].unitPrice, 99.9);
assert.equal(items[1].unitPrice, null);
assert.notEqual(items[1].unitPrice, 10, "Receita por produtos / unidades não pode gerar preço unitário");

// 14–17: arquivo/hash duplicado, retries permitidos e linha idempotente.
const bytes = Buffer.from("mesmo arquivo");
assert.equal(salesFileHash(bytes), salesFileHash(bytes));
assert.equal(salesRetryMessage("completed"), "Este arquivo já foi importado anteriormente.");
assert.equal(salesRetryMessage("processing"), "Uma importação deste arquivo já está em andamento.");
assert.equal(salesRetryMessage("failed"), null);
assert.equal(salesRetryMessage("completed_with_errors"), null);
assert.equal(parsed.rows[0].sourceRowHash, parseSalesWorkbook(workbook()).rows[0].sourceRowHash);
assert.equal(new Set(parsed.rows.map((row) => row.sourceRowHash)).size, parsed.rows.length);

// 18–20: metadata, data brasileira e descarte completo de PII.
assert.equal(parsed.rows[0].line, 5);
assert.equal(parseBrazilianDate("11/08/2026")?.slice(0, 10), "2026-08-11");
assert.equal(parseBrazilianDate("08/11/2026")?.slice(0, 10), "2026-11-08");
assert.equal(parseBrazilianDate("11 de agosto de 2026 15:35 hs."), "2026-08-11T18:35:00.000Z");
assert.ok(exchangeRow);
assert.equal(exchangeRow.grossAmount, null);
assert.equal(parsed.rows.filter((row) => row.recordType === "exchange_summary").length, 2);
for (const row of parsed.rows) {
  assert.equal("buyerName" in row, false);
  assert.equal("cpf" in row, false);
  assert.equal("email" in row, false);
  assert.equal(JSON.stringify(row).includes("maria@example.com"), false);
}

assert.equal(normalizeMlb("MLA 123.456"), "MLB123456");
assert.equal(parsed.periodStart, "2026-08-11");
assert.equal(parsed.periodEnd, "2026-08-16");
assert.equal(parsed.problems.length, 0);

console.log("Cenários anteriores e 7 casos opcionais de publicidade/preço validados com sucesso.");
