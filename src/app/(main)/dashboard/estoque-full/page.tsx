import { AlertCircle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import { FullFifoDashboard } from "./_components/full-fifo-dashboard";
import { loadFullFifoAnalysis } from "./_lib/load-full-fifo-analysis";

export default async function FullInventoryPage() {
  try {
    const data = await loadFullFifoAnalysis();
    if (!data) {
      return (
        <Alert>
          <AlertCircle />
          <AlertTitle>Nenhum snapshot encontrado</AlertTitle>
          <AlertDescription>Importe um arquivo de Estoque FULL antes de abrir esta análise.</AlertDescription>
        </Alert>
      );
    }
    return <FullFifoDashboard data={data} />;
  } catch (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle />
        <AlertTitle>Não foi possível carregar a análise</AlertTitle>
        <AlertDescription>{error instanceof Error ? error.message : "Erro inesperado."}</AlertDescription>
      </Alert>
    );
  }
}
