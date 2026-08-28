import type { SupabaseClient } from "@supabase/supabase-js";

import type { InboundsFileImportResult, InboundsImportProblem, InboundsImportResult } from "./inbounds-import-types";
import {
  inboundLogicalKey,
  inboundRowsEquivalent,
  type ParsedInboundRow,
  parseInboundsCsv,
} from "./parse-inbounds-csv";
import { createHash } from "node:crypto";

const PROBLEM_LIMIT = 10;
type ImportStatus = "completed" | "completed_with_errors" | "failed" | "processing";

interface ImportInboundsFileInput {
  buffer: Buffer;
  fileName: string;
  userId: string;
  supabase: SupabaseClient;
}

interface ImportRecord {
  id: string;
  status: ImportStatus;
  import_type: string;
}

interface ExistingInbound {
  inbound_id: string;
  received_at: string | null;
  sku_raw: string;
  status_raw: string | null;
  mlb_raw: string | null;
  listing_numbers: string[] | null;
  units_declared: number | null;
  units_processed: number | null;
  units_difference: number | null;
  units_sellable: number | null;
  units_unsellable: number | null;
  units_unidentified: number | null;
}

export function inboundsFileHash(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export function inboundsRetryMessage(status: ImportStatus): string | null {
  if (status === "completed") return "Este arquivo já foi importado anteriormente.";
  if (status === "processing") return "Uma importação deste arquivo já está em andamento.";
  return null;
}

function emptyFileResult(fileName: string, message: string): InboundsFileImportResult {
  return {
    fileName,
    success: false,
    duplicateFile: true,
    inboundIds: [],
    recordsProcessed: 0,
    insertedRows: 0,
    existingRows: 0,
    historicalConflicts: 0,
    identifiedSkus: 0,
    unidentifiedSkus: 0,
    identifiedMlbs: 0,
    unidentifiedMlbs: 0,
    unitsDeclared: 0,
    unitsProcessed: 0,
    unitsDifference: 0,
    unitsSellable: 0,
    unitsUnsellable: 0,
    unitsUnidentified: 0,
    errors: 0,
    problems: [{ fileName, line: 0, message, severity: "warning" }],
  };
}

async function startImport(
  input: ImportInboundsFileInput,
): Promise<{ blocked?: InboundsFileImportResult; id?: string }> {
  const fileHash = inboundsFileHash(input.buffer);
  const { data: previous, error: lookupError } = await input.supabase
    .from("imports")
    .select("id, status, import_type")
    .eq("file_hash", fileHash)
    .maybeSingle();
  if (lookupError) throw new Error("Não foi possível verificar o histórico de importações.");
  if (previous) {
    const existing = previous as ImportRecord;
    if (existing.import_type !== "full_inbounds") {
      throw new Error("Os mesmos bytes já foram registrados por outro tipo de importação.");
    }
    const message = inboundsRetryMessage(existing.status);
    if (message) return { blocked: emptyFileResult(input.fileName, message) };
    const { data, error } = await input.supabase
      .from("imports")
      .update({ file_name: input.fileName, status: "processing", row_count: 0, error_count: 0 })
      .eq("id", existing.id)
      .in("status", ["failed", "completed_with_errors"])
      .select("id")
      .maybeSingle();
    if (error) throw new Error("Não foi possível reiniciar a importação de Envios FULL.");
    if (!data)
      return { blocked: emptyFileResult(input.fileName, "Uma importação deste arquivo já está em andamento.") };
    return { id: data.id as string };
  }

  const { data, error } = await input.supabase
    .from("imports")
    .insert({
      import_type: "full_inbounds",
      file_name: input.fileName,
      file_hash: fileHash,
      status: "processing",
      imported_by: input.userId,
    })
    .select("id")
    .single();
  if (!error) return { id: data.id as string };
  if (error.code !== "23505") throw new Error("Não foi possível iniciar o registro da importação.");
  const { data: concurrent, error: concurrentError } = await input.supabase
    .from("imports")
    .select("id, status, import_type")
    .eq("file_hash", fileHash)
    .single();
  if (concurrentError) throw new Error("Não foi possível verificar a importação concorrente.");
  const existing = concurrent as ImportRecord;
  if (existing.import_type !== "full_inbounds") {
    throw new Error("Os mesmos bytes já foram registrados por outro tipo de importação.");
  }
  const message = inboundsRetryMessage(existing.status);
  if (message) return { blocked: emptyFileResult(input.fileName, message) };
  const { data: retried, error: retryError } = await input.supabase
    .from("imports")
    .update({ file_name: input.fileName, status: "processing", row_count: 0, error_count: 0 })
    .eq("id", existing.id)
    .in("status", ["failed", "completed_with_errors"])
    .select("id")
    .maybeSingle();
  if (retryError) throw new Error("Não foi possível reiniciar a importação concorrente.");
  if (retried) return { id: retried.id as string };
  return { blocked: emptyFileResult(input.fileName, "Uma importação deste arquivo já está em andamento.") };
}

function databaseRowAsParsed(row: ExistingInbound): ParsedInboundRow {
  return {
    line: 0,
    inboundId: row.inbound_id,
    receivedAt: row.received_at ? new Date(row.received_at).toISOString() : "",
    skuRaw: row.sku_raw,
    statusRaw: row.status_raw,
    mlbRaw: row.mlb_raw,
    listingNumbers: row.listing_numbers ?? [],
    unitsDeclared: row.units_declared,
    unitsProcessed: row.units_processed,
    unitsDifference: row.units_difference,
    unitsSellable: row.units_sellable,
    unitsUnsellable: row.units_unsellable,
    unitsUnidentified: row.units_unidentified,
  };
}

export function inboundDatabaseValues(
  row: ParsedInboundRow,
  input: { importId: string; productId: string | null; listingId: string | null; sourceFile: string },
) {
  return {
    import_id: input.importId,
    inbound_id: row.inboundId,
    received_at: row.receivedAt,
    product_id: input.productId,
    listing_id: input.listingId,
    sku_raw: row.skuRaw,
    status_raw: row.statusRaw,
    mlb_raw: row.mlbRaw,
    listing_numbers: row.listingNumbers,
    units_declared: row.unitsDeclared,
    units_processed: row.unitsProcessed,
    units_difference: row.unitsDifference,
    units_sellable: row.unitsSellable,
    units_unsellable: row.unitsUnsellable,
    units_unidentified: row.unitsUnidentified,
    source_file: input.sourceFile,
  };
}

function total(rows: ParsedInboundRow[], property: keyof ParsedInboundRow): number {
  return rows.reduce((sum, row) => sum + (typeof row[property] === "number" ? (row[property] as number) : 0), 0);
}

export async function importInboundsFile(input: ImportInboundsFileInput): Promise<InboundsFileImportResult> {
  const started = await startImport(input);
  if (started.blocked) return started.blocked;
  if (!started.id) throw new Error("Não foi possível iniciar a importação de Envios FULL.");

  let rowCount = 0;
  try {
    const parsed = parseInboundsCsv(input.buffer);
    rowCount = parsed.rowCount;
    const problems: InboundsImportProblem[] = parsed.problems.map((problem) => ({
      ...problem,
      fileName: input.fileName,
    }));
    const skus = [...new Set(parsed.rows.map((row) => row.skuRaw))];
    const mlbs = [...new Set(parsed.rows.flatMap((row) => row.listingNumbers))];
    const inboundIds = [...new Set(parsed.rows.map((row) => row.inboundId))];
    const { data: products, error: productsError } = skus.length
      ? await input.supabase.from("products").select("id, sku").in("sku", skus)
      : { data: [], error: null };
    if (productsError) throw new Error("Não foi possível consultar os produtos.");
    const { data: listings, error: listingsError } = mlbs.length
      ? await input.supabase.from("listings").select("id, mlb").in("mlb", mlbs)
      : { data: [], error: null };
    if (listingsError) throw new Error("Não foi possível consultar os anúncios.");
    const { data: existingRows, error: existingError } = inboundIds.length
      ? await input.supabase
          .from("full_inbounds")
          .select(
            "inbound_id, received_at, sku_raw, status_raw, mlb_raw, listing_numbers, units_declared, units_processed, units_difference, units_sellable, units_unsellable, units_unidentified",
          )
          .in("inbound_id", inboundIds)
      : { data: [], error: null };
    if (existingError) throw new Error("Não foi possível consultar o histórico de Envios FULL.");

    const productIds = new Map((products ?? []).map((product) => [product.sku as string, product.id as string]));
    const listingIds = new Map((listings ?? []).map((listing) => [listing.mlb as string, listing.id as string]));
    const existing = new Map(
      ((existingRows ?? []) as ExistingInbound[]).map((row) => [inboundLogicalKey(databaseRowAsParsed(row)), row]),
    );
    for (const row of parsed.rows) {
      if (!productIds.has(row.skuRaw)) {
        problems.push({
          fileName: input.fileName,
          line: row.line,
          message: `SKU não identificado: ${row.skuRaw}`,
          severity: "warning",
        });
      }
      for (const mlb of row.listingNumbers) {
        if (!listingIds.has(mlb)) {
          problems.push({
            fileName: input.fileName,
            line: row.line,
            message: `MLB não identificado: ${mlb}`,
            severity: "warning",
          });
        }
      }
    }

    let insertedRows = 0;
    let equivalentRows = 0;
    let historicalConflicts = 0;
    let persistenceErrors = 0;
    for (const row of parsed.rows) {
      const current = existing.get(inboundLogicalKey(row));
      if (current) {
        if (inboundRowsEquivalent(row, databaseRowAsParsed(current))) equivalentRows += 1;
        else {
          historicalConflicts += 1;
          problems.push({
            fileName: input.fileName,
            line: row.line,
            message: `Conflito histórico para envio ${row.inboundId} e SKU ${row.skuRaw}`,
            severity: "error",
          });
        }
        continue;
      }
      const listingId = row.listingNumbers.length === 1 ? (listingIds.get(row.listingNumbers[0]) ?? null) : null;
      const { error } = await input.supabase.from("full_inbounds").insert(
        inboundDatabaseValues(row, {
          importId: started.id,
          productId: productIds.get(row.skuRaw) ?? null,
          listingId,
          sourceFile: input.fileName,
        }),
      );
      if (error) {
        if (error.code === "23505") {
          const { data: concurrentRow, error: concurrentError } = await input.supabase
            .from("full_inbounds")
            .select(
              "inbound_id, received_at, sku_raw, status_raw, mlb_raw, listing_numbers, units_declared, units_processed, units_difference, units_sellable, units_unsellable, units_unidentified",
            )
            .eq("inbound_id", row.inboundId)
            .eq("sku_raw", row.skuRaw)
            .maybeSingle();
          if (!concurrentError && concurrentRow) {
            if (inboundRowsEquivalent(row, databaseRowAsParsed(concurrentRow as ExistingInbound))) {
              equivalentRows += 1;
            } else {
              historicalConflicts += 1;
              problems.push({
                fileName: input.fileName,
                line: row.line,
                message: `Conflito histórico para envio ${row.inboundId} e SKU ${row.skuRaw}`,
                severity: "error",
              });
            }
            continue;
          }
        }
        persistenceErrors += 1;
        problems.push({
          fileName: input.fileName,
          line: row.line,
          message: `Falha ao gravar o envio ${row.inboundId} e SKU ${row.skuRaw}`,
          severity: "error",
        });
      } else insertedRows += 1;
    }

    const parsingErrors = parsed.problems.filter((problem) => problem.severity === "error").length;
    const errorCount = parsingErrors + historicalConflicts + persistenceErrors;
    const status = errorCount ? "completed_with_errors" : "completed";
    const { error: finishError } = await input.supabase
      .from("imports")
      .update({ status, row_count: rowCount, error_count: errorCount })
      .eq("id", started.id);
    if (finishError) throw new Error("A importação terminou, mas seu status não pôde ser atualizado.");

    const knownMlbs = new Set(mlbs.filter((mlb) => listingIds.has(mlb)));
    return {
      fileName: input.fileName,
      success: true,
      duplicateFile: false,
      inboundIds,
      recordsProcessed: rowCount,
      insertedRows,
      existingRows: equivalentRows + parsed.duplicateRows,
      historicalConflicts,
      identifiedSkus: parsed.rows.filter((row) => productIds.has(row.skuRaw)).length,
      unidentifiedSkus: parsed.rows.filter((row) => !productIds.has(row.skuRaw)).length,
      identifiedMlbs: knownMlbs.size,
      unidentifiedMlbs: mlbs.length - knownMlbs.size,
      unitsDeclared: total(parsed.rows, "unitsDeclared"),
      unitsProcessed: total(parsed.rows, "unitsProcessed"),
      unitsDifference: total(parsed.rows, "unitsDifference"),
      unitsSellable: total(parsed.rows, "unitsSellable"),
      unitsUnsellable: total(parsed.rows, "unitsUnsellable"),
      unitsUnidentified: total(parsed.rows, "unitsUnidentified"),
      errors: errorCount,
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

export function consolidateInboundsResults(files: InboundsFileImportResult[]): InboundsImportResult {
  const sum = (property: keyof InboundsFileImportResult) =>
    files.reduce(
      (totalValue, file) => totalValue + (typeof file[property] === "number" ? (file[property] as number) : 0),
      0,
    );
  const problems = files.flatMap((file) => file.problems).slice(0, PROBLEM_LIMIT);
  const errors = sum("errors");
  return {
    success: files.every((file) => file.success || file.duplicateFile),
    message: errors ? "Importação concluída com erros" : "Importação concluída",
    filesProcessed: files.length,
    inboundIds: new Set(files.flatMap((file) => file.inboundIds)).size,
    recordsProcessed: sum("recordsProcessed"),
    insertedRows: sum("insertedRows"),
    existingRows: sum("existingRows"),
    historicalConflicts: sum("historicalConflicts"),
    identifiedSkus: sum("identifiedSkus"),
    unidentifiedSkus: sum("unidentifiedSkus"),
    identifiedMlbs: sum("identifiedMlbs"),
    unidentifiedMlbs: sum("unidentifiedMlbs"),
    unitsDeclared: sum("unitsDeclared"),
    unitsProcessed: sum("unitsProcessed"),
    unitsDifference: sum("unitsDifference"),
    unitsSellable: sum("unitsSellable"),
    unitsUnsellable: sum("unitsUnsellable"),
    unitsUnidentified: sum("unitsUnidentified"),
    errors,
    problems,
    files,
  };
}
