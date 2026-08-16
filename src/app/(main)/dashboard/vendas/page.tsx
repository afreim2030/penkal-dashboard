import { AlertCircle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import { SalesDashboard } from "./_components/sales-dashboard";
import { loadSalesDashboard } from "./_lib/load-sales-dashboard";

export default async function SalesPage() {
  try {
    const data = await loadSalesDashboard();

    if (!data?.coverage.maxCompleteDate) {
      return (
        <Alert>
          <AlertCircle />
          <AlertTitle>Sem período completo de vendas</AlertTitle>
          <AlertDescription>
            Importe um relatório de vendas e confirme a cobertura para liberar os indicadores.
          </AlertDescription>
        </Alert>
      );
    }

    return <SalesDashboard data={data} />;
  } catch (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle />
        <AlertTitle>Não foi possível carregar Vendas</AlertTitle>
        <AlertDescription>
          {error instanceof Error ? error.message : "Ocorreu um erro ao consultar os dados de vendas."}
        </AlertDescription>
      </Alert>
    );
  }
}
