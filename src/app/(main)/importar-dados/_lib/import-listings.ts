import type { SupabaseClient } from "@supabase/supabase-js";

import type { ImportProblem, ListingsImportResult } from "./listings-import-types";
import { parseListingsXlsx } from "./parse-listings-xlsx";
import { createHash } from "node:crypto";

const PROBLEM_LIMIT = 10;

export function sha256File(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export function classifyListingMlbs(mlbs: string[], existingMlbs: ReadonlySet<string>) {
  return mlbs.reduce(
    (counts, mlb) => {
      if (existingMlbs.has(mlb)) counts.updated += 1;
      else counts.created += 1;
      return counts;
    },
    { created: 0, updated: 0 },
  );
}

interface ImportListingsInput {
  buffer: Buffer;
  fileName: string;
  userId: string;
  supabase: SupabaseClient;
}

type ExistingImportStatus = "completed" | "completed_with_errors" | "failed" | "processing";

interface ImportRecord {
  id: string;
}

interface ImportRecordResolution {
  record: ImportRecord | null;
  blockedResult: ListingsImportResult | null;
}

function failedResult(message: string): ListingsImportResult {
  return {
    success: false,
    duplicate: false,
    message,
    productsIdentified: 0,
    listingsProcessed: 0,
    listingsCreated: 0,
    listingsUpdated: 0,
    errors: 1,
    problems: [],
  };
}

export function retryMessageForStatus(status: ExistingImportStatus): string | null {
  if (status === "completed") return "Este arquivo já foi importado anteriormente.";
  if (status === "processing") return "Uma importação deste arquivo já está em andamento.";
  return null;
}

function blockedImportResult(message: string): ListingsImportResult {
  return {
    ...failedResult(message),
    duplicate: true,
    errors: 0,
  };
}

async function resolveExistingImport(
  supabase: SupabaseClient,
  existingImport: ImportRecord & { status: ExistingImportStatus },
): Promise<ImportRecordResolution> {
  const blockedMessage = retryMessageForStatus(existingImport.status);
  if (blockedMessage) return { record: null, blockedResult: blockedImportResult(blockedMessage) };

  const { data: retryRecord, error: retryError } = await supabase
    .from("imports")
    .update({ status: "processing", row_count: 0, error_count: 0 })
    .eq("id", existingImport.id)
    .in("status", ["failed", "completed_with_errors"])
    .select("id")
    .maybeSingle();

  if (retryError) throw new Error("Não foi possível reiniciar a importação.");
  if (!retryRecord) {
    return {
      record: null,
      blockedResult: blockedImportResult("Uma importação deste arquivo já está em andamento."),
    };
  }

  return { record: retryRecord, blockedResult: null };
}

async function startImportRecord({
  fileHash,
  fileName,
  userId,
  supabase,
}: Omit<ImportListingsInput, "buffer"> & { fileHash: string }): Promise<ImportRecordResolution> {
  const { data: previousImport, error: lookupError } = await supabase
    .from("imports")
    .select("id, status")
    .eq("file_hash", fileHash)
    .maybeSingle();

  if (lookupError) throw new Error("Não foi possível verificar o histórico de importações.");
  if (previousImport) {
    return resolveExistingImport(supabase, previousImport as ImportRecord & { status: ExistingImportStatus });
  }

  const { data: importRecord, error: insertImportError } = await supabase
    .from("imports")
    .insert({
      import_type: "listings",
      file_name: fileName,
      file_hash: fileHash,
      status: "processing",
      imported_by: userId,
    })
    .select("id")
    .single();

  if (!insertImportError) return { record: importRecord, blockedResult: null };
  if (insertImportError.code !== "23505") throw new Error("Não foi possível iniciar o registro da importação.");

  const { data: concurrentImport, error: concurrentLookupError } = await supabase
    .from("imports")
    .select("id, status")
    .eq("file_hash", fileHash)
    .single();

  if (concurrentLookupError) throw new Error("Não foi possível verificar a importação concorrente.");
  return resolveExistingImport(supabase, concurrentImport as ImportRecord & { status: ExistingImportStatus });
}

export async function importListings({
  buffer,
  fileName,
  userId,
  supabase,
}: ImportListingsInput): Promise<ListingsImportResult> {
  const fileHash = sha256File(buffer);
  const { record: importRecord, blockedResult } = await startImportRecord({ fileHash, fileName, userId, supabase });
  if (blockedResult) return blockedResult;
  if (!importRecord) throw new Error("Não foi possível iniciar a importação.");

  let rowCount = 0;
  try {
    const parsed = parseListingsXlsx(buffer);
    rowCount = parsed.rowCount;
    const problems: ImportProblem[] = [...parsed.problems];
    const invalidLines = new Set(problems.map((problem) => problem.line));
    const validRows = parsed.rows.filter((row) => !invalidLines.has(row.line));
    const firstRowBySku = new Map(validRows.map((row) => [row.sku, row]));

    if (firstRowBySku.size > 0) {
      const { error } = await supabase.from("products").upsert(
        [...firstRowBySku.values()].map((row) => ({ sku: row.sku, name: row.title })),
        { onConflict: "sku", ignoreDuplicates: true },
      );
      if (error) throw new Error("Não foi possível identificar os produtos do arquivo.");
    }

    const skus = [...firstRowBySku.keys()];
    const { data: products, error: productsError } = skus.length
      ? await supabase.from("products").select("id, sku").in("sku", skus)
      : { data: [], error: null };
    if (productsError) throw new Error("Não foi possível carregar os produtos identificados.");

    const productIdBySku = new Map((products ?? []).map((product) => [product.sku, product.id]));
    const lastRowByMlb = new Map(validRows.map((row) => [row.mlb, row]));
    const mlbs = [...lastRowByMlb.keys()];
    const { data: existingListings, error: existingError } = mlbs.length
      ? await supabase.from("listings").select("mlb").in("mlb", mlbs)
      : { data: [], error: null };
    if (existingError) throw new Error("Não foi possível verificar os anúncios existentes.");

    const existingMlbs = new Set((existingListings ?? []).map((listing) => listing.mlb));
    let listingsCreated = 0;
    let listingsUpdated = 0;

    for (const row of lastRowByMlb.values()) {
      const productId = productIdBySku.get(row.sku);
      if (!productId) {
        problems.push({ line: row.line, message: `Produto não encontrado para o SKU ${row.sku}` });
        continue;
      }

      const { error } = await supabase.from("listings").upsert(
        {
          mlb: row.mlb,
          product_id: productId,
          title: row.title,
          listing_type: row.listingType,
          status: row.status,
          current_price: row.price,
        },
        { onConflict: "mlb" },
      );

      if (error) {
        problems.push({ line: row.line, message: `Falha ao gravar o anúncio ${row.mlb}` });
      } else if (existingMlbs.has(row.mlb)) {
        listingsUpdated += 1;
      } else {
        listingsCreated += 1;
      }
    }

    const { error: reconcileError } = await supabase.rpc("reconcile_data_links");
    if (reconcileError) {
      problems.push({ line: 0, message: "Não foi possível reconciliar os vínculos após atualizar o catálogo." });
    }

    const errorCount = new Set(problems.map((problem) => problem.line)).size;
    const status = errorCount > 0 ? "completed_with_errors" : "completed";
    const { error: finishError } = await supabase
      .from("imports")
      .update({ status, row_count: rowCount, error_count: errorCount })
      .eq("id", importRecord.id);
    if (finishError) throw new Error("A importação terminou, mas seu status não pôde ser atualizado.");

    return {
      success: true,
      duplicate: false,
      message: "Importação concluída",
      productsIdentified: productIdBySku.size,
      listingsProcessed: listingsCreated + listingsUpdated,
      listingsCreated,
      listingsUpdated,
      errors: errorCount,
      problems: problems.slice(0, PROBLEM_LIMIT),
    };
  } catch (error) {
    await supabase
      .from("imports")
      .update({ status: "failed", row_count: rowCount, error_count: 1 })
      .eq("id", importRecord.id);
    throw error;
  }
}
