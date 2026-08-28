import { AlertCircle, CheckCircle2 } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import { LinkingDashboard } from "./_components/linking-dashboard";
import { loadLinkingDashboard } from "./_lib/load-linking-dashboard";

interface PageProps {
  searchParams: Promise<{ error?: string; success?: string }>;
}

export default async function Page({ searchParams }: PageProps) {
  const feedback = await searchParams;

  try {
    const data = await loadLinkingDashboard();
    return (
      <div className="flex flex-col gap-4">
        {feedback.success ? (
          <Alert>
            <CheckCircle2 />
            <AlertTitle>Vínculo atualizado</AlertTitle>
            <AlertDescription>{feedback.success}</AlertDescription>
          </Alert>
        ) : null}
        {feedback.error ? (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertTitle>Não foi possível vincular</AlertTitle>
            <AlertDescription>{feedback.error}</AlertDescription>
          </Alert>
        ) : null}
        <LinkingDashboard data={data} />
      </div>
    );
  } catch (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle />
        <AlertTitle>Não foi possível carregar os vínculos</AlertTitle>
        <AlertDescription>
          {error instanceof Error ? error.message : "Ocorreu um erro ao consultar a fila de correção."}
        </AlertDescription>
      </Alert>
    );
  }
}
