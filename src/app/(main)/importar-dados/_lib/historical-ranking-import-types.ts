export interface HistoricalRankingProblem {
  line: number;
  message: string;
  severity: "warning" | "error";
}

export interface HistoricalRankingImportResult {
  success: boolean;
  duplicate: boolean;
  message: string;
  recordsProcessed: number;
  insertedRows: number;
  identifiedSkus: number;
  unidentifiedSkus: number;
  totalHistoricalUnits: number;
  errors: number;
  problems: HistoricalRankingProblem[];
}
