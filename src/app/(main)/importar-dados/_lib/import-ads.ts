import type { SupabaseClient } from "@supabase/supabase-js";

import { type ParsedAdsRow, parseAdsXlsx } from "./parse-ads-xlsx";
import { createHash } from "node:crypto";

const BATCH_SIZE = 500;
export interface AdsFileInput {
  buffer: Buffer;
  fileName: string;
}
export interface AdsFileResult {
  fileName: string;
  periodStart: string | null;
  periodEnd: string | null;
  rows: number;
  processed: number;
  errors: number;
  duplicate: boolean;
  problems: { line: number; message: string }[];
}

function rpcRow(row: ParsedAdsRow, sourceFile: string) {
  return {
    period_start: row.periodStart,
    period_end: row.periodEnd,
    campaign_name: row.campaignName,
    ad_title: row.title,
    mlb_raw: row.mlbRaw,
    status: row.status,
    impressions: row.impressions,
    clicks: row.clicks,
    cpc: row.cpc,
    ctr: row.ctr,
    conversion: row.conversion,
    revenue: row.revenue,
    investment: row.investment,
    acos: row.acos,
    roas: row.roas,
    direct_sales: row.directSales,
    indirect_sales: row.indirectSales,
    source_file: sourceFile,
    source_row_hash: row.sourceRowHash,
  };
}

async function processFile(supabase: SupabaseClient, userId: string, file: AdsFileInput): Promise<AdsFileResult> {
  const hash = createHash("sha256").update(file.buffer).digest("hex");
  const { data: existing, error: lookupError } = await supabase
    .from("imports")
    .select("id,status,period_start,period_end,row_count")
    .eq("file_hash", hash)
    .maybeSingle();
  if (lookupError) throw new Error("Não foi possível consultar o histórico de publicidade.");
  if (existing?.status === "completed")
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
  const parsed = parseAdsXlsx(file.buffer);
  let importId = existing?.id as string | undefined;
  const metadata = {
    file_name: file.fileName,
    status: "processing",
    period_start: parsed.periodStart,
    period_end: parsed.periodEnd,
    row_count: parsed.rows.length,
    error_count: parsed.problems.length,
    source_exported_at: null,
    source_exported_at_source: "unknown",
  };
  if (importId) {
    const { error } = await supabase.from("imports").update(metadata).eq("id", importId);
    if (error) throw new Error("Não foi possível reiniciar a importação de publicidade.");
  } else {
    const { data, error } = await supabase
      .from("imports")
      .insert({ ...metadata, import_type: "ad_metrics", file_hash: hash, imported_by: userId })
      .select("id")
      .single();
    if (error || !data) throw new Error("Não foi possível iniciar a importação de publicidade.");
    importId = data.id as string;
  }
  try {
    let processed = 0;
    for (let offset = 0; offset < parsed.rows.length; offset += BATCH_SIZE) {
      const batch = parsed.rows.slice(offset, offset + BATCH_SIZE).map((row) => rpcRow(row, file.fileName));
      const { data, error } = await supabase.rpc("process_ad_metrics_batch", { p_import_id: importId, p_rows: batch });
      if (error) throw new Error(`Não foi possível processar a publicidade: ${error.message}`);
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

export async function importAds({
  files,
  userId,
  supabase,
}: {
  files: AdsFileInput[];
  userId: string;
  supabase: SupabaseClient;
}) {
  const results: AdsFileResult[] = [];
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
        problems: [{ line: 0, message: error instanceof Error ? error.message : "Erro ao importar publicidade." }],
      });
    }
  }
  const totals = results.reduce(
    (sum, item) => ({
      files: sum.files + 1,
      rows: sum.rows + item.rows,
      processed: sum.processed + item.processed,
      errors: sum.errors + item.errors,
      duplicates: sum.duplicates + (item.duplicate ? 1 : 0),
    }),
    { files: 0, rows: 0, processed: 0, errors: 0, duplicates: 0 },
  );
  return { success: totals.errors === 0, files: results, totals };
}
