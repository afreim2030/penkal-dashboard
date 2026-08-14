export interface FullImportProblem {
  line: number;
  message: string;
  severity: "error" | "warning";
}

export interface FullImportResult {
  success: boolean;
  duplicate: boolean;
  message: string;
  recordsProcessed: number;
  identifiedSkus: number;
  unidentifiedSkus: number;
  identifiedMlbs: number;
  unidentifiedMlbs: number;
  positiveStockSkus: number;
  zeroStockSkus: number;
  totalQuantityFull: number;
  totalUnitsAffectStockTime: number;
  insertedRows: number;
  errors: number;
  problems: FullImportProblem[];
}
