import type { SupabaseClient } from "@supabase/supabase-js";

import { type ParsedPerformanceRow, parsePerformanceXlsx } from "./parse-performance-xlsx";
import { createHash } from "node:crypto";

const BATCH_SIZE = 500;

export interface PerformanceFileInput {
  buffer: Buffer;
  fileName: string;
}

export interface PerformanceFileResult {
  fileName: string;
  periodStart: string | null;
  periodEnd: string | null;
  rows: number;
  processed: number;
  errors: number;
  duplicate: boolean;
  problems: { line: number; message: string }[];
}

export interface PerformanceImportResult {
  success: boolean;
  files: PerformanceFileResult[];
  totals: {
    files: number;
    rows: number;
    processed: number;
    errors: number;
    duplicates: number;
  };
}

function fileHash(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function rpcRow(row: ParsedPerformanceRow, sourceFile: string) {
  return {
    period_start: row.periodStart,
    period_end: row.periodEnd,
    sku_raw: row.skuRaw,
    mlb_raw: row.mlbRaw,
    visits: row.visits,
    sales_count: row.salesCount,
    units_sold: row.unitsSold,
    gross_sales: row.grossSales,
    conversion: row.conversion,
    source_file: sourceFile,
    status_current: row.statusCurrent,
    variation: row.variation,
    ad_quality: row.adQuality,
    purchase_experience: row.purchaseExperience,
    unique_buyers: row.uniqueBuyers,
    participation: row.participation,
    buyer_conversion: row.buyerConversion,
    total_reviews: row.totalReviews,
    bad_reviews: row.badReviews,
    good_reviews: row.goodReviews,
    source_row_hash: row.sourceRowHash,
  };
}

async function processFile(
  supabase: SupabaseClient,
  userId: string,
  file: PerformanceFileInput,
): Promise<PerformanceFileResult> {
  const hash = fileHash(file.buffer);
  const { data: existing, error: lookupError } = await supabase
    .from("imports")
    .select("id, status, period_start, period_end, row_count, error_count")
    .eq("file_hash", hash)
    .maybeSingle();
  if (lookupError) throw new Error("Não foi possível verificar o histórico de performance.");

  if (existing?.status === "completed") {
    return {
      fileName: file.fileName,
      periodStart: existing.period_start,
      periodEnd: existing.period_end,
      rows: existing.row_count ?? 0,
      processed: 0,
      errors: 0,
      duplicate: true,
      problems: [],
    };
  }

  const parsed = parsePerformanceXlsx(file.buffer);
  let importId = existing?.id as string | undefined;

  if (importId) {
    const { error } = await supabase
      .from("imports")
      .update({
        file_name: file.fileName,
        status: "processing",
        period_start: parsed.periodStart,
        period_end: parsed.periodEnd,
        row_count: parsed.rows.length,
        error_count: parsed.problems.length,
        source_exported_at: null,
        source_exported_at_source: "unknown",
      })
      .eq("id", importId);
    if (error) throw new Error("Não foi possível reiniciar a importação de performance.");
  } else {
    const { data, error } = await supabase
      .from("imports")
      .insert({
        import_type: "listing_performance",
        file_name: file.fileName,
        file_hash: hash,
        status: "processing",
        period_start: parsed.periodStart,
        period_end: parsed.periodEnd,
        row_count: parsed.rows.length,
        error_count: parsed.problems.length,
        imported_by: userId,
        source_exported_at: null,
        source_exported_at_source: "unknown",
      })
      .select("id")
      .single();
    if (error || !data) throw new Error("Não foi possível iniciar a importação de performance.");
    importId = data.id as string;
  }

  let processed = 0;
  try {
    for (let offset = 0; offset < parsed.rows.length; offset += BATCH_SIZE) {
      const batch = parsed.rows.slice(offset, offset + BATCH_SIZE).map((row) => rpcRow(row, file.fileName));
      const { data, error } = await supabase.rpc("process_listing_performance_batch", {
        p_import_id: importId,
        p_rows: batch,
      });
      if (error) throw new Error("Não foi possível processar as métricas de anúncios.");
      processed += Number(data?.processed ?? batch.length);
    }

    const errors = parsed.problems.length;
    await supabase
      .from("imports")
      .update({ status: errors ? "completed_with_errors" : "completed", error_count: errors })
      .eq("id", importId);

    return {
      fileName: file.fileName,
      periodStart: parsed.periodStart,
      periodEnd: parsed.periodEnd,
      rows: parsed.rows.length,
      processed,
      errors,
      duplicate: false,
      problems: parsed.problems.slice(0, 10),
    };
  } catch (error) {
    await supabase.from("imports").update({ status: "failed", error_count: 1 }).eq("id", importId);
    throw error;
  }
}

export async function importPerformance({
  files,
  userId,
  supabase,
}: {
  files: PerformanceFileInput[];
  userId: string;
  supabase: SupabaseClient;
}): Promise<PerformanceImportResult> {
  const results: PerformanceFileResult[] = [];
  for (const file of files) {
    try {
      results.push(await processFile(supabase, userId, file));
    } catch (error) {
      results.push({
        fileName: file.fileName,
        periodStart: null,
        periodEnd: null,
        rows: 0,
        processed: 0,
        errors: 1,
        duplicate: false,
        problems: [{ line: 0, message: error instanceof Error ? error.message : "Erro ao importar performance." }],
      });
    }
  }

  const totals = results.reduce(
    (sum, result) => ({
      files: sum.files + 1,
      rows: sum.rows + result.rows,
      processed: sum.processed + result.processed,
      errors: sum.errors + result.errors,
      duplicates: sum.duplicates + (result.duplicate ? 1 : 0),
    }),
    { files: 0, rows: 0, processed: 0, errors: 0, duplicates: 0 },
  );

  return { success: totals.errors === 0, files: results, totals };
}
