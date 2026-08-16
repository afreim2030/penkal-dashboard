import { AlertCircle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import { SettingsDashboard } from "./_components/settings-dashboard";
import { loadSettingsDashboard } from "./_lib/load-settings-dashboard";

export default async function Page() {
  try {
    const data = await loadSettingsDashboard();
    return <SettingsDashboard data={data} />;
  } catch (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle />
        <AlertTitle>Não foi possível carregar as configurações</AlertTitle>
        <AlertDescription>
          {error instanceof Error ? error.message : "Ocorreu um erro ao consultar a saúde da base."}
        </AlertDescription>
      </Alert>
    );
  }
}
