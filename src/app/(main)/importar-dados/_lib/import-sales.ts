import type { SupabaseClient } from "@supabase/supabase-js";

import { type ParsedSaleRow, parseSalesExportedAt, parseSalesXlsx } from "./parse-sales-xlsx";
import type { SalesImportFileResult, SalesImportProblem, SalesImportResult } from "./sales-import-types";
import { createHash } from "node:crypto";

const PROBLEM_LIMIT = 10;
const MAX_FILES = 20;
const SALES_RPC_BATCH_SIZE = 500;

type ImportStatus = "completed" | "completed_with_errors" | "failed" | "processing";

export interface SalesFileInput {
  buffer: Buffer;
  fileName: string;
}

export interface ImportSalesInput {
  files: SalesFileInput[];
  userId: string;
  supabase: SupabaseClient;
}

interface ImportRecord {
  id: string;
  status: ImportStatus;
}

interface PreparedFile {
  input: SalesFileInput;
  fileHash: string;
  importRecord: ImportRecord;
  sourceExportedAt: string | null;
  sourceExportedAtSource: "filename" | "unknown";
  parsed: ReturnType<typeof parseSalesXlsx>;
  validRows: ParsedSaleRow[];
  problems: SalesImportProblem[];
}

interface BatchActionCounts {
  inserted: number;
  updated: number;
  duplicate_exact: number;
  old_ignored: number;
  conflicts: number;
}

function emptyBatchActions(): BatchActionCounts {
  return {
    inserted: 0,
    updated: 0,
    duplicate_exact: 0,
    old_ignored: 0,
    conflicts: 0,
  };
}

function addBatchActions(target: BatchActionCounts, source: BatchActionCounts): void {
  target.inserted += source.inserted;
  target.updated += source.updated;
  target.duplicate_exact += source.duplicate_exact;
  target.old_ignored += source.old_ignored;
  target.conflicts += source.conflicts;
}

export function salesFileHash(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export function salesRetryMessage(status: ImportStatus): string | null {
  if (status === "completed") return "Este arquivo já foi importado anteriormente.";
  if (status === "processing") return "Uma importação deste arquivo já está em andamento.";
  return null;
}

function emptyFileResult(
  fileName: string,
  sourceExportedAt: string | null,
  sourceExportedAtSource: "filename" | "unknown",
  message: string,
  duplicate: boolean,
): SalesImportFileResult {
  return {
    fileName,
    periodStart: null,
    periodEnd: null,
    sourceExportedAt,
    sourceExportedAtSource,
    rows: 0,
    saleItems: 0,
    packageSummaries: 0,
    exchangeSummaries: 0,
    insertedRows: 0,
    updatedRows: 0,
    exactDuplicates: 0,
    oldIgnoredRows: 0,
    conflicts: 0,
    errors: duplicate ? 0 : 1,
    duplicate,
    problems: duplicate ? [] : [{ line: 0, message }],
  };
}

async function startImport(
  supabase: SupabaseClient,
  file: SalesFileInput,
  fileHash: string,
  sourceExportedAt: string | null,
  sourceExportedAtSource: "filename" | "unknown",
  userId: string,
): Promise<{ record: ImportRecord | null; blocked: SalesImportFileResult | null }> {
  const metadata = {
    file_name: file.fileName,
    source_exported_at: sourceExportedAt,
    source_exported_at_source: sourceExportedAtSource,
  };
  const { data: previous, error: lookupError } = await supabase
    .from("imports")
    .select("id, status")
    .eq("file_hash", fileHash)
    .maybeSingle();
  if (lookupError) throw new Error("Não foi possível verificar o histórico de importações.");

  if (previous) {
    const existing = previous as ImportRecord;
    const message = salesRetryMessage(existing.status);
    if (message) {
      return {
        record: null,
        blocked: emptyFileResult(file.fileName, sourceExportedAt, sourceExportedAtSource, message, true),
      };
    }

    const { data, error } = await supabase
      .from("imports")
      .update({ ...metadata, status: "processing", row_count: 0, error_count: 0 })
      .eq("id", existing.id)
      .in("status", ["failed", "completed_with_errors"])
      .select("id, status")
      .maybeSingle();
    if (error) throw new Error("Não foi possível reiniciar a importação de vendas.");
    if (!data) {
      return {
        record: null,
        blocked: emptyFileResult(
          file.fileName,
          sourceExportedAt,
          sourceExportedAtSource,
          "Uma importação deste arquivo já está em andamento.",
          true,
        ),
      };
    }
    return { record: data as ImportRecord, blocked: null };
  }

  const { data, error } = await supabase
    .from("imports")
    .insert({
      ...metadata,
      import_type: "sales",
      file_hash: fileHash,
      status: "processing",
      imported_by: userId,
    })
    .select("id, status")
    .single();
  if (!error) return { record: data as ImportRecord, blocked: null };
  if (error.code !== "23505") throw new Error("Não foi possível iniciar o registro da importação.");

  const { data: concurrent, error: concurrentError } = await supabase
    .from("imports")
    .select("id, status")
    .eq("file_hash", fileHash)
    .single();
  if (concurrentError) throw new Error("Não foi possível verificar a importação concorrente.");
  const concurrentRecord = concurrent as ImportRecord;
  const message = salesRetryMessage(concurrentRecord.status);
  return {
    record: message ? null : concurrentRecord,
    blocked: message ? emptyFileResult(file.fileName, sourceExportedAt, sourceExportedAtSource, message, true) : null,
  };
}

function salesRow(
  row: ParsedSaleRow,
  productId: string | null,
  listingId: string | null,
  sourceFile: string,
  importId: string,
  sourceExportedAt: string | null,
) {
  return {
    import_id: importId,
    source_exported_at: sourceExportedAt,
    sale_number: row.saleNumber || null,
    sale_date: row.saleDate || null,
    product_id: productId,
    listing_id: listingId,
    sku_raw: row.skuRaw,
    mlb_raw: row.mlbRaw,
    listing_title: row.listingTitle,
    variation: row.variation,
    listing_type_raw: row.listingTypeRaw,
    unit_price: row.unitPrice,
    gross_amount: row.grossAmount,
    net_amount: row.netAmount,
    fees: row.saleFeeTax,
    product_revenue: row.productRevenue,
    additional_price_revenue: row.additionalPriceRevenue,
    installment_fee: row.installmentFee,
    sale_fee_tax: row.saleFeeTax,
    shipping_revenue: row.shippingRevenue,
    shipping_fee: row.shippingFee,
    exchange_shipping_cost: row.exchangeShippingCost,
    declared_dimensions_shipping_cost: row.declaredDimensionsShippingCost,
    dimensions_difference_cost: row.dimensionsDifferenceCost,
    discounts_bonuses: row.discountsBonuses,
    cancellations_refunds: row.cancellationsRefunds,
    billing_month: row.billingMonth,
    official_store: row.officialStore,
    shipping_method: row.shippingMethod,
    ads_sale: row.adsSale,
    cancelled: (row.cancellationsRefunds ?? 0) < 0 || /cancelad[ao]/i.test(row.saleStatus ?? ""),
    multi_product_package: row.multiProductPackage,
    belongs_to_kit: row.belongsToKit,
    package_parent_sale_number: row.packageParentSaleNumber,
    package_size: row.packageSize,
    sale_status: row.saleStatus,
    status_description: row.statusDescription,
    quantity: row.quantity,
    record_type: row.recordType,
    source_row_number: row.line,
    source_row_hash: row.sourceRowHash,
    source_file: sourceFile,
  };
}

function datesBetween(start: string | null, end: string | null): string[] {
  if (!start || !end) return [];
  const dates: string[] = [];
  const current = new Date(`${start}T00:00:00.000Z`);
  const last = new Date(`${end}T00:00:00.000Z`);
  while (current <= last) {
    dates.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

async function upsertCoverage(supabase: SupabaseClient, files: PreparedFile[]): Promise<void> {
  const rows = files.flatMap((file) =>
    datesBetween(file.parsed.periodStart, file.parsed.periodEnd).map((coverageDate) => ({
      import_id: file.importRecord.id,
      coverage_date: coverageDate,
      coverage_status: "unknown",
      coverage_source: file.sourceExportedAt ? "export_datetime" : "report_scope",
      evidence: file.sourceExportedAt
        ? "Período observado no conteúdo; escopo diário da exportação não foi comprovado."
        : "Período observado no conteúdo; timestamp e escopo diário não foram comprovados.",
    })),
  );
  if (!rows.length) return;
  const { error } = await supabase
    .from("sales_import_coverage")
    .upsert(rows, { onConflict: "import_id,coverage_date" });
  if (error) throw new Error("Não foi possível registrar a cobertura da importação de vendas.");
}

function totals(files: SalesImportFileResult[]): SalesImportResult["totals"] {
  return files.reduce(
    (sum, file) => ({
      rows: sum.rows + file.rows,
      saleItems: sum.saleItems + file.saleItems,
      packageSummaries: sum.packageSummaries + file.packageSummaries,
      exchangeSummaries: sum.exchangeSummaries + file.exchangeSummaries,
      insertedRows: sum.insertedRows + file.insertedRows,
      updatedRows: sum.updatedRows + file.updatedRows,
      exactDuplicates: sum.exactDuplicates + file.exactDuplicates,
      oldIgnoredRows: sum.oldIgnoredRows + file.oldIgnoredRows,
      conflicts: sum.conflicts + file.conflicts,
      errors: sum.errors + file.errors,
    }),
    {
      rows: 0,
      saleItems: 0,
      packageSummaries: 0,
      exchangeSummaries: 0,
      insertedRows: 0,
      updatedRows: 0,
      exactDuplicates: 0,
      oldIgnoredRows: 0,
      conflicts: 0,
      errors: 0,
    },
  );
}

export async function importSales(input: ImportSalesInput): Promise<SalesImportResult> {
  if (input.files.length === 0) throw new Error("Selecione ao menos um arquivo XLSX.");
  if (input.files.length > MAX_FILES) throw new Error(`Selecione no máximo ${MAX_FILES} arquivos por lote.`);

  const results: SalesImportFileResult[] = [];
  const prepared: PreparedFile[] = [];

  for (const file of input.files) {
    const fileHash = salesFileHash(file.buffer);
    const sourceExportedAt = parseSalesExportedAt(file.fileName);
    const sourceExportedAtSource = sourceExportedAt ? "filename" : "unknown";
    const { record, blocked } = await startImport(
      input.supabase,
      file,
      fileHash,
      sourceExportedAt,
      sourceExportedAtSource,
      input.userId,
    );
    if (blocked) {
      results.push(blocked);
      continue;
    }
    if (!record) throw new Error("Não foi possível iniciar a importação de vendas.");

    try {
      const parsed = parseSalesXlsx(file.buffer);
      const problems: SalesImportProblem[] = [...parsed.problems];
      const fatalLines = new Set(
        parsed.problems
          .filter((problem) => /vazio|inválida|inválidas|sem valor financeiro/.test(problem.message))
          .map((problem) => problem.line),
      );
      prepared.push({
        input: file,
        fileHash,
        importRecord: record,
        sourceExportedAt,
        sourceExportedAtSource,
        parsed,
        validRows: parsed.rows.filter((row) => !fatalLines.has(row.line)),
        problems,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível interpretar o arquivo.";
      await input.supabase
        .from("imports")
        .update({ status: "failed", row_count: 0, error_count: 1 })
        .eq("id", record.id);
      results.push(emptyFileResult(file.fileName, sourceExportedAt, sourceExportedAtSource, message, false));
    }
  }

  if (prepared.length) {
    const skus = [
      ...new Set(prepared.flatMap((file) => file.validRows.flatMap((row) => (row.skuRaw ? [row.skuRaw] : [])))),
    ];
    const mlbs = [
      ...new Set(prepared.flatMap((file) => file.validRows.flatMap((row) => (row.mlbRaw ? [row.mlbRaw] : [])))),
    ];
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

    const orderedFiles = [...prepared].sort((left, right) => {
      if (left.sourceExportedAt === null && right.sourceExportedAt !== null) return 1;
      if (left.sourceExportedAt !== null && right.sourceExportedAt === null) return -1;
      if (left.sourceExportedAt !== right.sourceExportedAt) {
        return (left.sourceExportedAt ?? "").localeCompare(right.sourceExportedAt ?? "");
      }
      return left.fileHash.localeCompare(right.fileHash);
    });

    for (const file of orderedFiles) {
      const batchRows = file.validRows.map((row) =>
        salesRow(
          row,
          row.skuRaw ? (productIds.get(row.skuRaw) ?? null) : null,
          row.mlbRaw ? (listingIds.get(row.mlbRaw) ?? null) : null,
          file.input.fileName,
          file.importRecord.id,
          file.sourceExportedAt,
        ),
      );
      const actions = emptyBatchActions();
      try {
        const totalBatches = Math.max(1, Math.ceil(batchRows.length / SALES_RPC_BATCH_SIZE));
        for (let offset = 0; offset < batchRows.length; offset += SALES_RPC_BATCH_SIZE) {
          const chunk = batchRows.slice(offset, offset + SALES_RPC_BATCH_SIZE);
          const batchNumber = Math.floor(offset / SALES_RPC_BATCH_SIZE) + 1;
          const { data: batchResult, error: batchError } = await input.supabase.rpc("process_sales_import_batch", {
            p_rows: chunk,
          });
          if (batchError) {
            throw new Error(
              `Não foi possível processar o bloco ${batchNumber} de ${totalBatches} do arquivo ${file.input.fileName}.`,
            );
          }
          const chunkActions =
            ((batchResult?.by_import ?? {}) as Record<string, BatchActionCounts>)[file.importRecord.id] ??
            emptyBatchActions();
          addBatchActions(actions, chunkActions);
        }

        const errors = file.problems.length + actions.conflicts;
        await input.supabase
          .from("imports")
          .update({
            status: errors ? "completed_with_errors" : "completed",
            row_count: file.parsed.rowCount,
            error_count: errors,
            period_start: file.parsed.periodStart,
            period_end: file.parsed.periodEnd,
          })
          .eq("id", file.importRecord.id);
        results.push({
          fileName: file.input.fileName,
          periodStart: file.parsed.periodStart,
          periodEnd: file.parsed.periodEnd,
          sourceExportedAt: file.sourceExportedAt,
          sourceExportedAtSource: file.sourceExportedAtSource,
          rows: file.parsed.rowCount,
          saleItems: file.validRows.filter((row) => row.recordType === "sale_item").length,
          packageSummaries: file.validRows.filter((row) => row.recordType === "package_summary").length,
          exchangeSummaries: file.validRows.filter((row) => row.recordType === "exchange_summary").length,
          insertedRows: actions.inserted,
          updatedRows: actions.updated,
          exactDuplicates: actions.duplicate_exact,
          oldIgnoredRows: actions.old_ignored,
          conflicts: actions.conflicts,
          errors,
          duplicate: false,
          problems: file.problems.slice(0, PROBLEM_LIMIT),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Não foi possível processar o lote.";
        await input.supabase
          .from("imports")
          .update({ status: "failed", row_count: file.parsed.rowCount, error_count: 1 })
          .eq("id", file.importRecord.id);
        results.push({
          fileName: file.input.fileName,
          periodStart: file.parsed.periodStart,
          periodEnd: file.parsed.periodEnd,
          sourceExportedAt: file.sourceExportedAt,
          sourceExportedAtSource: file.sourceExportedAtSource,
          rows: file.parsed.rowCount,
          saleItems: file.validRows.filter((row) => row.recordType === "sale_item").length,
          packageSummaries: file.validRows.filter((row) => row.recordType === "package_summary").length,
          exchangeSummaries: file.validRows.filter((row) => row.recordType === "exchange_summary").length,
          insertedRows: actions.inserted,
          updatedRows: actions.updated,
          exactDuplicates: actions.duplicate_exact,
          oldIgnoredRows: actions.old_ignored,
          conflicts: actions.conflicts,
          errors: file.problems.length + 1,
          duplicate: false,
          problems: [...file.problems, { line: 0, message }].slice(0, PROBLEM_LIMIT),
        });
      }
    }
    await upsertCoverage(input.supabase, prepared);
  }

  const summary = totals(results);
  return {
    success: summary.errors === 0,
    duplicate: results.length > 0 && results.every((file) => file.duplicate),
    message: summary.errors ? "Importação concluída com conflitos ou erros." : "Importação concluída.",
    files: results,
    totals: summary,
  };
}
