import { createClient } from "@/lib/supabase/server";

export type SourceHealthStatus = "ok" | "warning" | "empty";

export interface SourceHealthRow {
  key: string;
  label: string;
  status: SourceHealthStatus;
  statusLabel: string;
  detail: string;
  lastUpdate: string | null;
}

export interface SettingsDashboardData {
  account: {
    email: string | null;
    timezone: string;
    accessMode: string;
  };
  health: {
    sources: SourceHealthRow[];
    failedImports: number;
    conflicts: number;
  };
}

type ImportRow = {
  import_type: string;
  file_name: string;
  status: string;
  row_count: number | null;
  error_count: number | null;
  period_start: string | null;
  period_end: string | null;
  created_at: string;
};

function latestImport(rows: ImportRow[], type: string): ImportRow | null {
  return rows.find((row) => row.import_type === type) ?? null;
}

function importHealth({
  key,
  label,
  row,
  emptyDetail,
}: {
  key: string;
  label: string;
  row: ImportRow | null;
  emptyDetail: string;
}): SourceHealthRow {
  if (!row) {
    return { key, label, status: "empty", statusLabel: "Sem dados", detail: emptyDetail, lastUpdate: null };
  }

  const failed = row.status === "failed";
  return {
    key,
    label,
    status: failed ? "warning" : "ok",
    statusLabel: failed ? "Requer atenção" : "Carregado",
    detail: failed
      ? `${row.file_name} falhou na última tentativa.`
      : `${row.file_name} · ${row.row_count ?? 0} linhas processadas.`,
    lastUpdate: row.created_at,
  };
}

export async function loadSettingsDashboard(): Promise<SettingsDashboardData> {
  const supabase = await createClient();
  const [userResult, importsResult, conflictsResult, fullResult, inboundResult, adsResult] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("imports")
      .select("import_type,file_name,status,row_count,error_count,period_start,period_end,created_at")
      .order("created_at", { ascending: false })
      .limit(250),
    supabase.from("sales_import_conflicts").select("id", { count: "exact", head: true }),
    supabase
      .from("full_inventory_snapshots")
      .select("snapshot_at")
      .order("snapshot_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("full_inbounds")
      .select("received_at")
      .not("received_at", "is", null)
      .order("received_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("ad_metrics")
      .select("period_end")
      .order("period_end", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (importsResult.error) throw new Error(`Não foi possível consultar as importações: ${importsResult.error.message}`);

  const imports = (importsResult.data ?? []) as ImportRow[];
  const failedImports = imports.filter((row) => row.status === "failed").length;
  const performanceRows = imports.filter((row) => row.import_type === "listing_performance");
  const performanceFailed = performanceRows.filter((row) => row.status === "failed").length;
  const performanceLatest = latestImport(imports, "listing_performance");

  const sources: SourceHealthRow[] = [
    importHealth({
      key: "listings",
      label: "Anúncios",
      row: latestImport(imports, "listings"),
      emptyDetail: "Nenhum catálogo de anúncios importado.",
    }),
    importHealth({
      key: "sales",
      label: "Vendas",
      row: latestImport(imports, "sales"),
      emptyDetail: "Nenhum relatório de vendas importado.",
    }),
    performanceFailed > 0
      ? {
          key: "performance",
          label: "Performance",
          status: "warning",
          statusLabel: "Requer atenção",
          detail: `${performanceFailed} relatórios diários aguardam nova importação.`,
          lastUpdate: performanceLatest?.created_at ?? null,
        }
      : importHealth({
          key: "performance",
          label: "Performance",
          row: performanceLatest,
          emptyDetail: "Visitas e conversão ainda não foram carregadas.",
        }),
    importHealth({
      key: "full_inventory",
      label: "Estoque FULL",
      row: latestImport(imports, "full_inventory"),
      emptyDetail: "Nenhum snapshot do estoque FULL importado.",
    }),
    importHealth({
      key: "full_inbounds",
      label: "Envios FULL",
      row: latestImport(imports, "full_inbounds"),
      emptyDetail: "Nenhum envio FULL importado.",
    }),
    adsResult.data?.period_end
      ? {
          key: "ads",
          label: "Publicidade",
          status: "ok",
          statusLabel: "Carregado",
          detail: `Métricas disponíveis até ${adsResult.data.period_end}.`,
          lastUpdate: adsResult.data.period_end,
        }
      : {
          key: "ads",
          label: "Publicidade",
          status: "empty",
          statusLabel: "Sem dados",
          detail: "Nenhum relatório de publicidade importado.",
          lastUpdate: null,
        },
  ];

  if (fullResult.data?.snapshot_at) {
    const source = sources.find((item) => item.key === "full_inventory");
    if (source) source.detail = `${source.detail} Snapshot: ${String(fullResult.data.snapshot_at).slice(0, 10)}.`;
  }

  if (inboundResult.data?.received_at) {
    const source = sources.find((item) => item.key === "full_inbounds");
    if (source) source.detail = `${source.detail} Último recebimento conhecido: ${String(inboundResult.data.received_at).slice(0, 10)}.`;
  }

  return {
    account: {
      email: userResult.data.user?.email ?? null,
      timezone: "America/Sao_Paulo",
      accessMode: "Privado · usuário autenticado",
    },
    health: {
      sources,
      failedImports,
      conflicts: conflictsResult.count ?? 0,
    },
  };
}
