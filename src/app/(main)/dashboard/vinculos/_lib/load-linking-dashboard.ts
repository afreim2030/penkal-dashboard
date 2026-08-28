import { createClient } from "@/lib/supabase/server";

export type IdentifierType = "sku" | "mlb";

export interface LinkingIssue {
  identifierType: IdentifierType;
  rawValue: string;
  source: string;
  affectedRows: number;
}

export interface LinkingDashboardData {
  summary: {
    identifiers: number;
    affectedRows: number;
    skuIdentifiers: number;
    mlbIdentifiers: number;
  };
  issues: LinkingIssue[];
}

export async function loadLinkingDashboard(): Promise<LinkingDashboardData> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_linking_dashboard_data");

  if (error) throw new Error("Não foi possível consultar os vínculos pendentes.");
  if (!data || typeof data !== "object") throw new Error("A fila de vínculos retornou um formato inválido.");

  return data as LinkingDashboardData;
}
