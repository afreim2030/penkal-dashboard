import type { SupabaseClient } from "@supabase/supabase-js";

import { type ParsedSaleRow, parseSalesXlsx } from "./parse-sales-xlsx";
import type { SalesImportProblem, SalesImportResult } from "./sales-import-types";
import { createHash } from "node:crypto";

const PROBLEM_LIMIT = 10;
type ImportStatus = "completed" | "completed_with_errors" | "failed" | "processing";

interface ImportSalesInput {
  buffer: Buffer;
  fileName: string;
  userId: string;
  supabase: SupabaseClient;
}

interface ImportRecord {
  id: string;
}

export function salesFileHash(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export function salesRetryMessage(status: ImportStatus): string | null {
  if (status === "completed") return "Este arquivo já foi importado anteriormente.";
  if (status === "processing") return "Uma importação deste arquivo já está em andamento.";
  return null;
}

function emptyResult(message: string, duplicate: boolean): SalesImportResult {
  return {
    success: false,
    duplicate,
    message,
    salesProcessed: 0,
    saleItems: 0,
    packageSummaries: 0,
    exchangeSummaries: 0,
    insertedRows: 0,
    existingRows: 0,
    unidentifiedSkus: 0,
    unidentifiedMlbs: 0,
    errors: duplicate ? 0 : 1,
    problems: [],
  };
}

async function reuseImport(
  supabase: SupabaseClient,
  existing: ImportRecord & { status: ImportStatus },
): Promise<{ record: ImportRecord | null; blocked: SalesImportResult | null }> {
  const message = salesRetryMessage(existing.status);
  if (message) return { record: null, blocked: emptyResult(message, true) };

  const { data, error } = await supabase
    .from("imports")
    .update({ status: "processing", row_count: 0, error_count: 0 })
    .eq("id", existing.id)
    .in("status", ["failed", "completed_with_errors"])
    .select("id")
    .maybeSingle();
  if (error) throw new Error("Não foi possível reiniciar a importação de vendas.");
  if (!data) return { record: null, blocked: emptyResult("Uma importação deste arquivo já está em andamento.", true) };
  return { record: data, blocked: null };
}

async function startImport(input: ImportSalesInput, fileHash: string) {
  const { data: previous, error: lookupError } = await input.supabase
    .from("imports")
    .select("id, status")
    .eq("file_hash", fileHash)
    .maybeSingle();
  if (lookupError) throw new Error("Não foi possível verificar o histórico de importações.");
  if (previous) return reuseImport(input.supabase, previous as ImportRecord & { status: ImportStatus });

  const { data, error } = await input.supabase
    .from("imports")
    .insert({
      import_type: "sales",
      file_name: input.fileName,
      file_hash: fileHash,
      status: "processing",
      imported_by: input.userId,
    })
    .select("id")
    .single();
  if (!error) return { record: data, blocked: null };
  if (error.code !== "23505") throw new Error("Não foi possível iniciar o registro da importação.");

  const { data: concurrent, error: concurrentError } = await input.supabase
    .from("imports")
    .select("id, status")
    .eq("file_hash", fileHash)
    .single();
  if (concurrentError) throw new Error("Não foi possível verificar a importação concorrente.");
  return reuseImport(input.supabase, concurrent as ImportRecord & { status: ImportStatus });
}

function salesRow(row: ParsedSaleRow, productId: string | null, listingId: string | null, sourceFile: string) {
  return {
    sale_number: row.saleNumber,
    sale_date: row.saleDate,
    sale_status: row.saleStatus,
    status_description: row.statusDescription,
    quantity: row.quantity,
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
    record_type: row.recordType,
    source_row_number: row.line,
    source_row_hash: row.sourceRowHash,
    product_id: productId,
    listing_id: listingId,
    source_file: sourceFile,
  };
}

export async function importSales(input: ImportSalesInput): Promise<SalesImportResult> {
  const { record, blocked } = await startImport(input, salesFileHash(input.buffer));
  if (blocked) return blocked;
  if (!record) throw new Error("Não foi possível iniciar a importação.");

  let rowCount = 0;
  try {
    const parsed = parseSalesXlsx(input.buffer);
    rowCount = parsed.rowCount;
    const problems: SalesImportProblem[] = [...parsed.problems];
    const fatalLines = new Set(
      parsed.problems
        .filter((problem) => /vazio|inválida|inválidas|sem valor financeiro/.test(problem.message))
        .map((problem) => problem.line),
    );
    const validRows = parsed.rows.filter((row) => !fatalLines.has(row.line));
    const skus = [
      ...new Set(validRows.flatMap((row) => (row.recordType === "sale_item" && row.skuRaw ? [row.skuRaw] : []))),
    ];
    const mlbs = [
      ...new Set(validRows.flatMap((row) => (row.recordType === "sale_item" && row.mlbRaw ? [row.mlbRaw] : []))),
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
    let unidentifiedSkus = 0;
    let unidentifiedMlbs = 0;
    let insertedRows = 0;
    let existingRows = 0;

    for (const row of validRows) {
      const productId = row.skuRaw ? (productIds.get(row.skuRaw) ?? null) : null;
      const listingId = row.mlbRaw ? (listingIds.get(row.mlbRaw) ?? null) : null;
      if (row.recordType === "sale_item" && !row.skuRaw) {
        unidentifiedSkus += 1;
        problems.push({ line: row.line, message: "SKU vazio; item importado sem vínculo de produto" });
      } else if (row.recordType === "sale_item" && !productId) {
        unidentifiedSkus += 1;
        problems.push({ line: row.line, message: `SKU não identificado: ${row.skuRaw}` });
      }
      if (row.recordType === "sale_item" && !row.mlbRaw) {
        unidentifiedMlbs += 1;
        problems.push({ line: row.line, message: "MLB vazio; item importado sem vínculo de anúncio" });
      } else if (row.recordType === "sale_item" && !listingId) {
        unidentifiedMlbs += 1;
        problems.push({ line: row.line, message: `MLB não identificado: ${row.mlbRaw}` });
      }

      const { error } = await input.supabase.from("sales").insert(salesRow(row, productId, listingId, input.fileName));
      if (!error) insertedRows += 1;
      else if (error.code === "23505") existingRows += 1;
      else problems.push({ line: row.line, message: `Falha ao gravar a venda ${row.saleNumber}` });
    }

    const errorCount = problems.length;
    const status = errorCount ? "completed_with_errors" : "completed";
    const { error: finishError } = await input.supabase
      .from("imports")
      .update({
        status,
        row_count: rowCount,
        error_count: errorCount,
        period_start: parsed.periodStart,
        period_end: parsed.periodEnd,
      })
      .eq("id", record.id);
    if (finishError) throw new Error("A importação terminou, mas seu status não pôde ser atualizado.");

    return {
      success: true,
      duplicate: false,
      message: "Importação concluída",
      salesProcessed: new Set(validRows.map((row) => row.saleNumber)).size,
      saleItems: validRows.filter((row) => row.recordType === "sale_item").length,
      packageSummaries: validRows.filter((row) => row.recordType === "package_summary").length,
      exchangeSummaries: validRows.filter((row) => row.recordType === "exchange_summary").length,
      insertedRows,
      existingRows,
      unidentifiedSkus,
      unidentifiedMlbs,
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
