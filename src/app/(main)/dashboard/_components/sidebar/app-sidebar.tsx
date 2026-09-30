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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { NavMain } from "./nav-main";

export function AppSidebar({ accounts, activeAccountId, ...props }: React.ComponentProps<typeof Sidebar> & { accounts: MarketplaceAccount[]; activeAccountId: string | null }) {
  const router = useRouter();

  async function selectAccount(accountId: string) {
    if (accountId === activeAccountId) return;
    const supabase = createClient();
    const { error } = await supabase.rpc("set_active_marketplace_account", { p_account_id: accountId });
    if (!error) router.refresh();
  }

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
          <p className="mb-1 px-2 text-muted-foreground text-xs">Conta ativa</p>
          <Select value={activeAccountId ?? undefined} onValueChange={selectAccount}>
            <SelectTrigger className="w-full"><Store className="size-3.5" /><SelectValue placeholder="Selecione a conta" /></SelectTrigger>
            <SelectContent>
              {accounts.map((account) => <SelectItem key={account.id} value={account.id}>{account.name}</SelectItem>)}
            </SelectContent>
          </Select>
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
