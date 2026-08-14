export interface SalesImportProblem {
  line: number;
  message: string;
}

export interface SalesImportResult {
  success: boolean;
  duplicate: boolean;
  message: string;
  salesProcessed: number;
  saleItems: number;
  packageSummaries: number;
  exchangeSummaries: number;
  insertedRows: number;
  existingRows: number;
  unidentifiedSkus: number;
  unidentifiedMlbs: number;
  errors: number;
  problems: SalesImportProblem[];
}
