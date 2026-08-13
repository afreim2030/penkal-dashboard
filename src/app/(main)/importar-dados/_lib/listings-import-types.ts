export interface ImportProblem {
  line: number;
  message: string;
}

export interface ListingsImportResult {
  success: boolean;
  duplicate: boolean;
  message: string;
  productsIdentified: number;
  listingsProcessed: number;
  listingsCreated: number;
  listingsUpdated: number;
  errors: number;
  problems: ImportProblem[];
}
