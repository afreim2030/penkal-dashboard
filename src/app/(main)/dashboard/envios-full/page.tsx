import { AlertCircle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import { FullInboundsDashboard } from "./_components/full-inbounds-dashboard";
import { loadFullInboundsDashboard } from "./_lib/load-full-inbounds-dashboard";

export default async function FullInboundsPage() {
  try {
    const data = await loadFullInboundsDashboard();
    if (!data?.summary.inbounds) {
      return (
        <Alert>
          <AlertCircle />
          <AlertTitle>Sem envios FULL</AlertTitle>
          <AlertDescription>Importe os relatórios de recebimento do FULL para visualizar o histórico.</AlertDescription>
        </Alert>
      );
    }
    return <FullInboundsDashboard data={data} />;
  } catch (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle />
        <AlertTitle>Não foi possível carregar Envios FULL</AlertTitle>
        <AlertDescription>
          {error instanceof Error ? error.message : "Ocorreu um erro ao consultar os envios FULL."}
        </AlertDescription>
      </Alert>
    );
  }
}
