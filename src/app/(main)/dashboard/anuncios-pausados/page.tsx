import { AlertCircle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import { InactiveListingsDashboard } from "./_components/inactive-listings-dashboard";
import { loadInactiveListingsDashboard } from "./_lib/load-inactive-listings-dashboard";

export default async function InactiveListingsPage() {
  try {
    const rows = await loadInactiveListingsDashboard();
    return <InactiveListingsDashboard rows={rows} />;
  } catch (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle />
        <AlertTitle>Não foi possível carregar os anúncios pausados</AlertTitle>
        <AlertDescription>{error instanceof Error ? error.message : "Ocorreu um erro ao consultar os anúncios."}</AlertDescription>
      </Alert>
    );
  }
}
