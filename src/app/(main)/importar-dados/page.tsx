import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import { ImportFullInventoryCard } from "./_components/import-full-inventory-card";
import { ImportInboundsCard } from "./_components/import-inbounds-card";
import { ImportListingsCard } from "./_components/import-listings-card";
import { ImportSalesCard } from "./_components/import-sales-card";

export default async function Page() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/v1/login");

  return (
    <main className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl tracking-tight">Importar Dados</h1>
        <p className="text-muted-foreground text-sm">
          Envie relatórios do Mercado Livre para atualizar os dados do sistema.
        </p>
      </div>
      <div className="grid max-w-6xl gap-4 lg:grid-cols-2">
        <ImportListingsCard />
        <ImportSalesCard />
        <ImportFullInventoryCard />
        <ImportInboundsCard />
      </div>
    </main>
  );
}
