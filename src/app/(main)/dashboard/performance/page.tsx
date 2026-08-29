import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { PerformanceDashboard } from "./_components/performance-dashboard";
import { loadPerformanceDashboard } from "./_lib/load-performance-dashboard";

export default async function Page() {
  try {
    const data = await loadPerformanceDashboard();
    if (!data?.coverage.maxDate) return <Alert><AlertCircle /><AlertTitle>Sem dados de performance</AlertTitle><AlertDescription>Importe um relatório de performance para liberar visitas e conversão.</AlertDescription></Alert>;
    return <PerformanceDashboard data={data} />;
  } catch (error) {
    return <Alert variant="destructive"><AlertCircle /><AlertTitle>Não foi possível carregar Performance</AlertTitle><AlertDescription>{error instanceof Error ? error.message : "Ocorreu um erro ao consultar os dados de performance."}</AlertDescription></Alert>;
  }
}
