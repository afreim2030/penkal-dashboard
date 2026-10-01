import type { ReactNode } from "react";

import { AppSidebar } from "@/app/(main)/dashboard/_components/sidebar/app-sidebar";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

import { getMarketplaceAccounts } from "@/lib/marketplace-accounts";

import { switchMarketplaceAccount } from "./_actions/switch-marketplace-account";
import { ThemeSwitcher } from "./_components/header/theme-switcher";

const accountButtons = [
  { id: "5ec7156d-4899-4e99-bd79-e9ff7056c522", label: "PENKAL" },
  { id: "8c5756df-727c-4993-b85c-ae18714aa004", label: "SÃO PAULO" },
];

export default async function Layout({ children }: Readonly<{ children: ReactNode }>) {
  const { accounts, activeAccountId } = await getMarketplaceAccounts();
  const activeAccountLabel = accountButtons.find((account) => account.id === activeAccountId)?.label ?? "—";

  return (
    <SidebarProvider
      defaultOpen
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 68)",
        } as React.CSSProperties
      }
    >
      <AppSidebar accounts={accounts} activeAccountId={activeAccountId} />
      <SidebarInset className="min-w-0 overflow-x-clip">
        <header className="sticky top-0 z-40 flex h-12 shrink-0 items-center border-b bg-background/90 backdrop-blur-md">
          <div className="flex w-full items-center justify-between px-4 lg:px-6">
            <div className="flex items-center gap-1 lg:gap-2">
              <SidebarTrigger className="-ml-1" />
              <Separator
                orientation="vertical"
                className="mx-2 data-[orientation=vertical]:h-4 data-[orientation=vertical]:self-center"
              />
              <span className="hidden font-medium text-sm sm:inline">Visualizando: {activeAccountLabel}</span>
              <div className="ml-1 flex items-center gap-1">
                {accountButtons.map((account) => (
                  <form key={account.id} action={switchMarketplaceAccount.bind(null, account.id)}>
                    <button
                      type="submit"
                      className={`rounded-md border px-2 py-1 font-semibold text-xs ${account.id === activeAccountId ? "border-amber-400 bg-amber-100 text-slate-950" : "bg-background hover:bg-accent"}`}
                    >
                      {account.label}
                    </button>
                  </form>
                ))}
              </div>
            </div>
            <ThemeSwitcher />
          </div>
        </header>
        <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden p-4 md:p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
