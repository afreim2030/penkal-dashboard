export type InboundsImportProblemSeverity = "error" | "warning";

export interface InboundsImportProblem {
  fileName?: string;
  line: number;
  message: string;
  severity: InboundsImportProblemSeverity;
}

export interface InboundsFileImportResult {
  fileName: string;
  success: boolean;
  duplicateFile: boolean;
  inboundIds: string[];
  recordsProcessed: number;
  insertedRows: number;
  existingRows: number;
  historicalConflicts: number;
  identifiedSkus: number;
  unidentifiedSkus: number;
  identifiedMlbs: number;
  unidentifiedMlbs: number;
  unitsDeclared: number;
  unitsProcessed: number;
  unitsDifference: number;
  unitsSellable: number;
  unitsUnsellable: number;
  unitsUnidentified: number;
  errors: number;
  problems: InboundsImportProblem[];
}

export interface InboundsImportResult {
  success: boolean;
  message: string;
  filesProcessed: number;
  inboundIds: number;
  recordsProcessed: number;
  insertedRows: number;
  existingRows: number;
  historicalConflicts: number;
  identifiedSkus: number;
  unidentifiedSkus: number;
  identifiedMlbs: number;
  unidentifiedMlbs: number;
  unitsDeclared: number;
  unitsProcessed: number;
  unitsDifference: number;
  unitsSellable: number;
  unitsUnsellable: number;
  unitsUnidentified: number;
  errors: number;
  problems: InboundsImportProblem[];
  files: InboundsFileImportResult[];
}
