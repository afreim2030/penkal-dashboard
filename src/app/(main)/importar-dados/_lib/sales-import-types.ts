export interface SalesImportProblem {
  line: number;
  message: string;
}

export type SalesExportedAtSource = "filename" | "report_header" | "user_confirmed" | "unknown";

export interface SalesImportFileResult {
  fileName: string;
  periodStart: string | null;
  periodEnd: string | null;
  sourceExportedAt: string | null;
  sourceExportedAtSource: SalesExportedAtSource;
  rows: number;
  saleItems: number;
  packageSummaries: number;
  exchangeSummaries: number;
  insertedRows: number;
  updatedRows: number;
  exactDuplicates: number;
  oldIgnoredRows: number;
  conflicts: number;
  errors: number;
  duplicate: boolean;
  problems: SalesImportProblem[];
}

export interface SalesImportResult {
  success: boolean;
  duplicate: boolean;
  message: string;
  files: SalesImportFileResult[];
  totals: Omit<
    SalesImportFileResult,
    "fileName" | "periodStart" | "periodEnd" | "sourceExportedAt" | "sourceExportedAtSource" | "duplicate" | "problems"
  >;
}
