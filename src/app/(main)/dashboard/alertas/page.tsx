import { AlertCircle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import { AlertsDashboard } from "./_components/alerts-dashboard";
import { loadAlertsDashboard } from "./_lib/load-alerts-dashboard";

export default async function Page() {
  try {
    const data = await loadAlertsDashboard();
    return <AlertsDashboard data={data} />;
  } catch (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle />
        <AlertTitle>Não foi possível carregar os alertas</AlertTitle>
        <AlertDescription>
          {error instanceof Error ? error.message : "Ocorreu um erro ao consultar as pendências operacionais."}
        </AlertDescription>
      </Alert>
    );
  }
}
