import { AlertCircle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import { TasksDashboard } from "./_components/tasks-dashboard";
import { loadOperationalTasks } from "./_lib/load-operational-tasks";
export default async function Page() {
  try {
    return <TasksDashboard tasks={await loadOperationalTasks()} />;
  } catch (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle />
        <AlertTitle>Não foi possível carregar Tarefas</AlertTitle>
        <AlertDescription>
          {error instanceof Error ? error.message : "Ocorreu um erro ao consultar as tarefas."}
        </AlertDescription>
      </Alert>
    );
  }
}
