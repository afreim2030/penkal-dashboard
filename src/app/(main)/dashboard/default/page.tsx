import { AlertCircle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import { MainDashboard } from "./_components/main-dashboard";
import { loadMainDashboard } from "./_lib/load-main-dashboard";

export default async function Page() {
  try {
    const data = await loadMainDashboard();
    if (!data) {
      return (
        <Alert>
          <AlertCircle />
          <AlertTitle>Dados insuficientes</AlertTitle>
          <AlertDescription>Importe os relatórios principais do Mercado Livre para montar o dashboard.</AlertDescription>
        </Alert>
      );
    }
    return <MainDashboard data={data} />;
  } catch (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle />
        <AlertTitle>Não foi possível carregar o Dashboard</AlertTitle>
        <AlertDescription>
          {error instanceof Error ? error.message : "Ocorreu um erro ao consultar os dados do painel."}
        </AlertDescription>
      </Alert>
    );
  }
}
