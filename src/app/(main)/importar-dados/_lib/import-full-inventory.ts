import type { SupabaseClient } from "@supabase/supabase-js";

import type { FullImportProblem, FullImportResult } from "./full-import-types";
import { type ParsedFullInventoryRow, parseFullInventoryXlsx } from "./parse-full-inventory-xlsx";
import { createHash } from "node:crypto";

const PROBLEM_LIMIT = 10;
const SNAPSHOT_TIME_ZONE = "America/Sao_Paulo";
type ImportStatus = "completed" | "completed_with_errors" | "failed" | "processing";

interface ImportFullInventoryInput {
  buffer: Buffer;
  fileName: string;
  userId: string;
  supabase: SupabaseClient;
}

interface ImportRecord {
  id: string;
  created_at: string;
}

export function fullInventoryFileHash(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export function fullInventoryRetryMessage(status: ImportStatus): string | null {
  if (status === "completed") return "Este arquivo já foi importado anteriormente.";
  if (status === "processing") return "Uma importação deste arquivo já está em andamento.";
  return null;
}

export function snapshotDateInSaoPaulo(snapshotAt: string): string {
  const date = new Date(snapshotAt);
  if (Number.isNaN(date.getTime())) throw new Error("O horário do registro de importação é inválido.");
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SNAPSHOT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function fullInventorySnapshotRow(
  row: ParsedFullInventoryRow,
  input: {
    importId: string;
    snapshotAt: string;
    productId: string | null;
    listingId: string | null;
    sourceFile: string;
  },
) {
  return {
    import_id: input.importId,
    snapshot_at: input.snapshotAt,
    snapshot_date: snapshotDateInSaoPaulo(input.snapshotAt),
    product_id: input.productId,
    listing_id: input.listingId,
    sku_raw: row.skuRaw,
    mlb_raw: row.mlbRaw,
    quantity_full: row.quantityFull,
    sales_30d: row.sales30d,
    units_affect_stock_time: row.unitsAffectStockTime,
    source_file: input.sourceFile,
  };
}

function emptyResult(message: string, duplicate: boolean): FullImportResult {
  return {
    success: false,
    duplicate,
    message,
    recordsProcessed: 0,
    identifiedSkus: 0,
    unidentifiedSkus: 0,
    identifiedMlbs: 0,
    unidentifiedMlbs: 0,
    positiveStockSkus: 0,
    zeroStockSkus: 0,
    totalQuantityFull: 0,
    totalUnitsAffectStockTime: 0,
    insertedRows: 0,
    errors: duplicate ? 0 : 1,
    problems: [],
  };
}

async function reuseImport(
  supabase: SupabaseClient,
  existing: ImportRecord & { status: ImportStatus },
): Promise<{ record: ImportRecord | null; blocked: FullImportResult | null }> {
  const message = fullInventoryRetryMessage(existing.status);
  if (message) return { record: null, blocked: emptyResult(message, true) };

  const { data, error } = await supabase
    .from("imports")
    .update({ status: "processing", row_count: 0, error_count: 0 })
    .eq("id", existing.id)
    .in("status", ["failed", "completed_with_errors"])
    .select("id, created_at")
    .maybeSingle();
  if (error) throw new Error("Não foi possível reiniciar a importação de estoque FULL.");
  if (!data) return { record: null, blocked: emptyResult("Uma importação deste arquivo já está em andamento.", true) };

  const { error: cleanupError } = await supabase.from("full_inventory_snapshots").delete().eq("import_id", existing.id);
  if (cleanupError) {
    await supabase.from("imports").update({ status: "failed", error_count: 1 }).eq("id", existing.id);
    throw new Error("Não foi possível limpar a tentativa anterior de estoque FULL.");
  }
  return { record: data as ImportRecord, blocked: null };
}

async function startImport(input: ImportFullInventoryInput, fileHash: string) {
  const { data: previous, error: lookupError } = await input.supabase
    .from("imports")
    .select("id, status, created_at")
    .eq("file_hash", fileHash)
    .maybeSingle();
  if (lookupError) throw new Error("Não foi possível verificar o histórico de importações.");
  if (previous) return reuseImport(input.supabase, previous as ImportRecord & { status: ImportStatus });

  const { data, error } = await input.supabase
    .from("imports")
    .insert({
      import_type: "full_inventory",
      file_name: input.fileName,
      file_hash: fileHash,
      status: "processing",
      imported_by: input.userId,
    })
    .select("id, created_at")
    .single();
  if (!error) return { record: data as ImportRecord, blocked: null };
  if (error.code !== "23505") throw new Error("Não foi possível iniciar o registro da importação.");

  const { data: concurrent, error: concurrentError } = await input.supabase
    .from("imports")
    .select("id, status, created_at")
    .eq("file_hash", fileHash)
    .single();
  if (concurrentError) throw new Error("Não foi possível verificar a importação concorrente.");
  return reuseImport(input.supabase, concurrent as ImportRecord & { status: ImportStatus });
}

export async function importFullInventory(input: ImportFullInventoryInput): Promise<FullImportResult> {
  const { record, blocked } = await startImport(input, fullInventoryFileHash(input.buffer));
  if (blocked) return blocked;
  if (!record) throw new Error("Não foi possível iniciar a importação de estoque FULL.");

  let rowCount = 0;
  try {
    const parsed = parseFullInventoryXlsx(input.buffer);
    rowCount = parsed.rowCount;
    const problems: FullImportProblem[] = [...parsed.problems];
    const skus = [...new Set(parsed.rows.map((row) => row.skuRaw))];
    const mlbs = [...new Set(parsed.rows.flatMap((row) => row.mlbs))];
    const { data: products, error: productsError } = skus.length
      ? await input.supabase.from("products").select("id, sku").in("sku", skus)
      : { data: [], error: null };
    if (productsError) throw new Error("Não foi possível consultar os produtos.");
    const { data: listings, error: listingsError } = mlbs.length
      ? await input.supabase.from("listings").select("id, mlb").in("mlb", mlbs)
      : { data: [], error: null };
    if (listingsError) throw new Error("Não foi possível consultar os anúncios.");

    const productIds = new Map((products ?? []).map((product) => [product.sku, product.id]));
    const listingIds = new Map((listings ?? []).map((listing) => [listing.mlb, listing.id]));
    const knownMlbs = new Set(listingIds.keys());
    const unidentifiedMlbValues = mlbs.filter((mlb) => !knownMlbs.has(mlb));
    const snapshotAt = record.created_at;
    let identifiedSkus = 0;
    let unidentifiedSkus = 0;
    let insertedRows = 0;
    let persistenceErrors = 0;

    for (const row of parsed.rows) {
      const productId = productIds.get(row.skuRaw) ?? null;
      if (productId) identifiedSkus += 1;
      else {
        unidentifiedSkus += 1;
        problems.push({ line: row.line, message: `SKU não identificado: ${row.skuRaw}`, severity: "warning" });
      }
      for (const mlb of row.mlbs) {
        if (!knownMlbs.has(mlb)) {
          problems.push({ line: row.line, message: `MLB não identificado: ${mlb}`, severity: "warning" });
        }
      }

      const { error } = await input.supabase.from("full_inventory_snapshots").insert(
        fullInventorySnapshotRow(row, {
          importId: record.id,
          snapshotAt,
          productId,
          listingId: row.mlbs.length === 1 ? (listingIds.get(row.mlbs[0]) ?? null) : null,
          sourceFile: input.fileName,
        }),
      );
      if (error) {
        persistenceErrors += 1;
        problems.push({ line: row.line, message: `Falha ao gravar o estoque do SKU ${row.skuRaw}`, severity: "error" });
      } else insertedRows += 1;
    }

    const parsingErrors = parsed.problems.filter((problem) => problem.severity === "error").length;
    const errorCount = parsingErrors + persistenceErrors;
    const status = errorCount ? "completed_with_errors" : "completed";
    const { error: finishError } = await input.supabase
      .from("imports")
      .update({ status, row_count: rowCount, error_count: errorCount })
      .eq("id", record.id);
    if (finishError) throw new Error("A importação terminou, mas seu status não pôde ser atualizado.");

    return {
      success: true,
      duplicate: false,
      message: errorCount ? "Importação concluída com erros" : "Importação concluída",
      recordsProcessed: rowCount,
      identifiedSkus,
      unidentifiedSkus,
      identifiedMlbs: mlbs.length - unidentifiedMlbValues.length,
      unidentifiedMlbs: unidentifiedMlbValues.length,
      positiveStockSkus: parsed.rows.filter((row) => row.quantityFull > 0).length,
      zeroStockSkus: parsed.rows.filter((row) => row.quantityFull === 0).length,
      totalQuantityFull: parsed.rows.reduce((total, row) => total + row.quantityFull, 0),
      totalUnitsAffectStockTime: parsed.rows.reduce((total, row) => total + (row.unitsAffectStockTime ?? 0), 0),
      insertedRows,
      errors: errorCount,
      problems: problems.slice(0, PROBLEM_LIMIT),
    };
  } catch (error) {
    await input.supabase
      .from("imports")
      .update({ status: "failed", row_count: rowCount, error_count: 1 })
      .eq("id", record.id);
    throw error;
  }
}
