import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function DashboardNotFound() {
  return (
    <div className="flex h-full flex-col items-center justify-center space-y-3 text-center">
      <h1 className="font-semibold text-2xl">Página não encontrada</h1>
      <p className="max-w-md text-muted-foreground text-sm">Esta rota não faz parte do painel operacional da Penkal.</p>
      <Button asChild variant="outline">
        <Link href="/dashboard/default">Voltar ao Dashboard</Link>
      </Button>
    </div>
  );
}
