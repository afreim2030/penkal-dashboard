"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { BookOpenCheck, LogOut, Store } from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { createClient } from "@/lib/supabase/client";
import type { MarketplaceAccount } from "@/lib/marketplace-accounts";
import { sidebarItems } from "@/navigation/sidebar/sidebar-items";

import { switchMarketplaceAccount } from "../../_actions/switch-marketplace-account";
import { NavMain } from "./nav-main";

export function AppSidebar({ accounts, activeAccountId, ...props }: React.ComponentProps<typeof Sidebar> & { accounts: MarketplaceAccount[]; activeAccountId: string | null }) {
  const router = useRouter();

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/auth/v1/login");
    router.refresh();
  }

  return (
    <Sidebar {...props} collapsible="icon" variant="sidebar">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg">
              <Link prefetch={false} href="/dashboard/default">
                <div className="flex size-8 items-center justify-center rounded-lg bg-amber-400 text-slate-950">
                  <BookOpenCheck className="size-5" />
                </div>
                <div className="grid flex-1 text-left leading-tight">
                  <span className="truncate font-semibold">Penkal</span>
                  <span className="truncate text-muted-foreground text-xs">Mercado Livre</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <div className="px-2 pb-2 group-data-[collapsible=icon]:hidden">
          <p className="mb-1 px-2 text-muted-foreground text-xs">Dados visualizados</p>
          <div className="flex flex-col gap-2 rounded-md border bg-background p-2">
            <Store className="ml-1 size-3.5 shrink-0 text-muted-foreground" />
            {accounts.slice(0, 2).map((account, index) => (
              <form key={account.id} action={switchMarketplaceAccount.bind(null, account.id)}>
                <button
                  type="submit"
                  className={`w-full rounded-md border px-3 py-2 text-left text-sm ${account.id === activeAccountId ? "border-amber-400 bg-amber-50 font-semibold text-slate-950 dark:bg-amber-950/30 dark:text-amber-100" : "bg-background hover:bg-accent"}`}
                >
                  {index === 0 ? "PENKAL" : "SÃO PAULO"}
                </button>
              </form>
            ))}
          </div>
        </div>
        <NavMain items={sidebarItems} />
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton type="button" onClick={signOut} tooltip="Sair">
              <LogOut />
              <span>Sair</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
