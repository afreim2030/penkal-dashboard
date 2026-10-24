import { AlertCircle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import { DeletedListingsDashboard } from "./_components/deleted-listings-dashboard";
import { loadDeletedListingsDashboard } from "./_lib/load-deleted-listings-dashboard";

export default async function DeletedListingsPage() {
  try {
    return <DeletedListingsDashboard rows={await loadDeletedListingsDashboard()} />;
  } catch (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle />
        <AlertTitle>Não foi possível carregar os anúncios excluídos</AlertTitle>
        <AlertDescription>
          {error instanceof Error ? error.message : "Ocorreu um erro ao consultar os anúncios."}
        </AlertDescription>
      </Alert>
    );
  }
}
