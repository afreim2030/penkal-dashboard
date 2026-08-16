import { AlertCircle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import { ProductsDashboard } from "./_components/products-dashboard";
import { loadProductsDashboard } from "./_lib/load-products-dashboard";

export default async function ProductsPage() {
  try {
    const data = await loadProductsDashboard();
    if (!data) {
      return (
        <Alert>
          <AlertCircle />
          <AlertTitle>Sem dados de produtos</AlertTitle>
          <AlertDescription>Importe o catálogo de anúncios para iniciar a consolidação por SKU.</AlertDescription>
        </Alert>
      );
    }
    return <ProductsDashboard data={data} />;
  } catch (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle />
        <AlertTitle>Não foi possível carregar Produtos</AlertTitle>
        <AlertDescription>
          {error instanceof Error ? error.message : "Ocorreu um erro ao consultar os produtos."}
        </AlertDescription>
      </Alert>
    );
  }
}
