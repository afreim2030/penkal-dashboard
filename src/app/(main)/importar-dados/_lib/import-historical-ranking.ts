import type { SupabaseClient } from "@supabase/supabase-js";

import type { HistoricalRankingImportResult, HistoricalRankingProblem } from "./historical-ranking-import-types";
import { parseHistoricalRankingXlsx } from "./parse-historical-ranking-xlsx";
import { createHash } from "node:crypto";

const PROBLEM_LIMIT = 10;
type ImportStatus = "completed" | "completed_with_errors" | "failed" | "processing";

interface Input {
  buffer: Buffer;
  fileName: string;
  userId: string;
  supabase: SupabaseClient;
}

interface ImportRecord {
  id: string;
  status: ImportStatus;
}

export function historicalRankingFileHash(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function result(message: string, duplicate: boolean): HistoricalRankingImportResult {
  return {
    success: false,
    duplicate,
    message,
    recordsProcessed: 0,
    insertedRows: 0,
    identifiedSkus: 0,
    unidentifiedSkus: 0,
    totalHistoricalUnits: 0,
    errors: duplicate ? 0 : 1,
    problems: [],
  };
}

async function activeAccountId(supabase: SupabaseClient): Promise<string> {
  const { data, error } = await supabase.rpc("get_active_marketplace_account_id");
  if (error || !data) throw new Error("Não foi possível identificar a conta ativa.");
  return data as string;
}

async function startImport(
  input: Input,
  accountId: string,
): Promise<{ id: string } | { blocked: HistoricalRankingImportResult }> {
  const fileHash = historicalRankingFileHash(input.buffer);
  const { data: previous, error: lookupError } = await input.supabase
    .from("imports")
    .select("id,status")
    .eq("account_id", accountId)
    .eq("file_hash", fileHash)
    .maybeSingle();
  if (lookupError) throw new Error("Não foi possível verificar o histórico de importações.");
  if (previous) {
    const importRecord = previous as ImportRecord;
    if (importRecord.status === "completed")
      return { blocked: result("Esta planilha já foi importada nesta conta.", true) };
    if (importRecord.status === "processing")
      return { blocked: result("Uma importação desta planilha já está em andamento.", true) };
    const { data, error } = await input.supabase
      .from("imports")
      .update({ status: "processing", row_count: 0, error_count: 0, file_name: input.fileName })
      .eq("id", importRecord.id)
      .select("id")
      .single();
    if (error || !data) throw new Error("Não foi possível reiniciar a importação do histórico.");
    return { id: data.id as string };
  }
  const { data, error } = await input.supabase
    .from("imports")
    .insert({
      account_id: accountId,
      import_type: "historical_sku_ranking",
      file_name: input.fileName,
      file_hash: fileHash,
      status: "processing",
      imported_by: input.userId,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error("Não foi possível iniciar a importação do histórico.");
  return { id: data.id as string };
}

export async function importHistoricalRanking(input: Input): Promise<HistoricalRankingImportResult> {
  const accountId = await activeAccountId(input.supabase);
  const started = await startImport(input, accountId);
  if ("blocked" in started) return started.blocked;
  let rowCount = 0;
  try {
    const parsed = parseHistoricalRankingXlsx(input.buffer);
    rowCount = parsed.rowCount;
    if (!parsed.rows.length) throw new Error("A planilha não possui SKUs válidos para importar.");
    const problems: HistoricalRankingProblem[] = [...parsed.problems];
    const skus = parsed.rows.map((row) => row.sku);
    const { data: products, error: productsError } = await input.supabase
      .from("products")
      .select("sku")
      .eq("account_id", accountId)
      .in("sku", skus);
    if (productsError) throw new Error("Não foi possível vincular os SKUs aos produtos.");
    const existingSkus = new Set((products ?? []).map((product) => product.sku as string));
    for (const row of parsed.rows)
      if (!existingSkus.has(row.sku)) {
        problems.push({
          line: row.line,
          message: `SKU ainda não cadastrado nesta conta: ${row.sku}`,
          severity: "warning",
        });
      }

    const records = parsed.rows.map((row) => ({
      account_id: accountId,
      import_id: started.id,
      sku: row.sku,
      product_name: row.productName,
      historical_units: row.historicalUnits,
      historical_rank: row.historicalRank,
      historical_curve: row.historicalCurve,
      source_file: input.fileName,
    }));
    for (let index = 0; index < records.length; index += 250) {
      const { error } = await input.supabase
        .from("historical_sku_rankings")
        .upsert(records.slice(index, index + 250), { onConflict: "account_id,sku" });
      if (error) throw new Error("Não foi possível gravar o ranking histórico.");
    }
    const { data: existing, error: existingError } = await input.supabase
      .from("historical_sku_rankings")
      .select("sku")
      .eq("account_id", accountId);
    if (existingError) throw new Error("Não foi possível concluir a atualização do ranking histórico.");
    const staleSkus = (existing ?? []).map((row) => row.sku as string).filter((sku) => !skus.includes(sku));
    if (staleSkus.length) {
      const { error } = await input.supabase
        .from("historical_sku_rankings")
        .delete()
        .eq("account_id", accountId)
        .in("sku", staleSkus);
      if (error) throw new Error("Não foi possível remover SKUs antigos do ranking histórico.");
    }
    const errors = problems.filter((problem) => problem.severity === "error").length;
    const { error: finishError } = await input.supabase
      .from("imports")
      .update({ status: errors ? "completed_with_errors" : "completed", row_count: rowCount, error_count: errors })
      .eq("id", started.id);
    if (finishError) throw new Error("O ranking foi importado, mas não foi possível atualizar seu status.");
    return {
      success: true,
      duplicate: false,
      message: errors ? "Importação concluída com pendências" : "Importação concluída",
      recordsProcessed: rowCount,
      insertedRows: records.length,
      identifiedSkus: records.filter((row) => existingSkus.has(row.sku)).length,
      unidentifiedSkus: records.filter((row) => !existingSkus.has(row.sku)).length,
      totalHistoricalUnits: parsed.totalHistoricalUnits,
      errors,
      problems: problems.slice(0, PROBLEM_LIMIT),
    };
  } catch (error) {
    await input.supabase
      .from("imports")
      .update({ status: "failed", row_count: rowCount, error_count: 1 })
      .eq("id", started.id);
    throw error;
  }
}
