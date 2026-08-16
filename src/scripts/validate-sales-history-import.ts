import { salesFileHash } from "../app/(main)/importar-dados/_lib/import-sales";
import { parseSalesExportedAt } from "../app/(main)/importar-dados/_lib/parse-sales-xlsx";
import assert from "node:assert/strict";

type Identity = {
  saleNumber: string | null;
  sku: string | null;
  mlb: string | null;
  recordType: "sale_item" | "package_summary" | "exchange_summary";
};

type Version = Identity & {
  hash: string;
  exportedAt: string | null;
  importId?: string;
  cancelled?: boolean;
  quantity?: number | null;
  status?: string;
};

type Decision = "insert" | "update" | "duplicate_exact" | "old_ignored" | "conflict";

function identityKey(row: Identity): string | null {
  if (row.recordType !== "sale_item") return null;
  if (!row.saleNumber || !row.sku || !row.mlb) return null;
  return [row.saleNumber, row.sku, row.mlb, row.recordType].join("\\u001f");
}

function decide(existing: Version | undefined, incoming: Version, hashOwner: Version | undefined): Decision {
  const key = identityKey(incoming);
  if (incoming.recordType === "sale_item" && !key) return "conflict";
  if (hashOwner && hashOwner !== existing && hashOwner.hash === incoming.hash) return "conflict";
  if (!existing) return "insert";
  if (existing.hash === incoming.hash) return "duplicate_exact";
  if (!existing.exportedAt || !incoming.exportedAt) return "conflict";
  if (incoming.exportedAt === existing.exportedAt) return "conflict";
  if (incoming.exportedAt > existing.exportedAt) return "update";
  return "old_ignored";
}

function resolveBatch(rows: Version[]): Map<string, Version> {
  const state = new Map<string, Version>();
  const ordered = [...rows].sort((left, right) => {
    if (left.exportedAt === null && right.exportedAt !== null) return 1;
    if (left.exportedAt !== null && right.exportedAt === null) return -1;
    return (left.exportedAt ?? "").localeCompare(right.exportedAt ?? "") || left.hash.localeCompare(right.hash);
  });
  for (const row of ordered) {
    const key = identityKey(row);
    if (key) {
      const decision = decide(
        state.get(key),
        row,
        [...state.values()].find((entry) => entry.hash === row.hash),
      );
      if (decision === "insert" || decision === "update") state.set(key, row);
    }
  }
  return state;
}

const namedFile = "20260811_Vendas_BR_Mercado_Libre_y_Mercado_Shops_2026-08-11_14-43hs_1102986048.xlsx";
assert.equal(parseSalesExportedAt(namedFile), "2026-08-11T17:43:00.000Z");
assert.equal(parseSalesExportedAt("JANEIRO.xlsx"), null);
assert.equal(parseSalesExportedAt("2026-02-30_Vendas_25-70hs.xlsx"), null);
assert.equal(parseSalesExportedAt("2026-08-11_23-59hs.xlsx"), "2026-08-12T02:59:00.000Z");

const base: Version = {
  saleNumber: "1",
  sku: "SKU-1",
  mlb: "MLB-1",
  recordType: "sale_item",
  hash: "hash-a",
  exportedAt: "2026-08-11T17:43:00.000Z",
  quantity: 1,
};
const newer: Version = {
  ...base,
  hash: "hash-b",
  exportedAt: "2026-08-12T15:25:00.000Z",
  importId: "import-new",
  cancelled: true,
};
const older: Version = { ...base, hash: "hash-c", exportedAt: "2026-08-10T15:25:00.000Z" };

assert.equal(decide(undefined, base, undefined), "insert");
assert.equal(decide(base, base, base), "duplicate_exact");
assert.equal(decide(base, newer, undefined), "update");
assert.equal(decide(newer, older, undefined), "old_ignored");
assert.equal(decide(older, newer, undefined), "update");
assert.equal(decide(base, { ...base, hash: "hash-d", exportedAt: base.exportedAt }, undefined), "conflict");
assert.equal(decide(base, { ...base, hash: "hash-e", exportedAt: null }, undefined), "conflict");
assert.equal(decide({ ...base, exportedAt: null }, newer, undefined), "conflict");
assert.equal(decide(undefined, { ...base, sku: null }, undefined), "conflict");
assert.equal(decide(base, { ...newer, hash: base.hash }, base), "duplicate_exact");
assert.equal(decide(undefined, { ...newer, hash: "hash-a", saleNumber: "2" }, base), "conflict");

const newerThenOlder = resolveBatch([older, newer]);
const olderThenNewer = resolveBatch([newer, older]);
const baseKey = identityKey(base);
assert.ok(baseKey);
assert.deepEqual(newerThenOlder.get(baseKey), newer);
assert.deepEqual(olderThenNewer.get(baseKey), newer);

const cancelledLater = resolveBatch([base, newer]).get(baseKey);
assert.equal(cancelledLater?.cancelled, true);
assert.equal(cancelledLater?.importId, "import-new");
assert.equal(cancelledLater?.saleNumber, base.saleNumber);
assert.equal(cancelledLater?.sku, base.sku);
assert.equal(cancelledLater?.mlb, base.mlb);
assert.equal(resolveBatch([base, { ...newer, quantity: 2 }]).get(baseKey)?.quantity, 2);

const packageSummary: Version = { ...base, recordType: "package_summary", sku: null, mlb: null, hash: "package-a" };
const exchangeSummary: Version = { ...base, recordType: "exchange_summary", sku: null, mlb: null, hash: "exchange-a" };
assert.equal(identityKey(packageSummary), null);
assert.equal(identityKey(exchangeSummary), null);
assert.equal(decide(packageSummary, packageSummary, packageSummary), "duplicate_exact");
assert.equal(decide(undefined, exchangeSummary, undefined), "insert");
assert.equal(salesFileHash(Buffer.from("same")), salesFileHash(Buffer.from("same")));

function isValidSale(row: Version): boolean {
  return (
    row.recordType === "sale_item" &&
    !["Cancelada pelo comprador", "Venda cancelada. Não envie.", "Pacote cancelado pelo Mercado Livre"].includes(
      row.status ?? "",
    ) &&
    row.cancelled !== true
  );
}

assert.equal(isValidSale({ ...base, cancelled: false }), true);
assert.equal(isValidSale({ ...base, recordType: "package_summary" }), false);
assert.equal(isValidSale({ ...base, cancelled: true }), false);
assert.equal(isValidSale({ ...base, status: "A caminho", cancelled: false }), true);
assert.equal(isValidSale({ ...base, status: "Cancelada pelo comprador", cancelled: false }), false);

const piiFreeRow = JSON.stringify(base);
assert.equal(/buyer|cpf|email|address|phone/i.test(piiFreeRow), false);

console.log("Cenários de deduplicação histórica, timezone, lote, identidade e PII validados.");
