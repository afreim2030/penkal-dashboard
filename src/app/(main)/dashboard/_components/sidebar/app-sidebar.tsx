"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

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

import { NavMain } from "./nav-main";

export function AppSidebar({ accounts, activeAccountId, ...props }: React.ComponentProps<typeof Sidebar> & { accounts: MarketplaceAccount[]; activeAccountId: string | null }) {
  const router = useRouter();
  const [selectedAccountId, setSelectedAccountId] = useState(activeAccountId);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const [isSwitching, setIsSwitching] = useState(false);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/auth/v1/login");
    router.refresh();
  }

  async function switchAccount(accountId: string) {
    if (accountId === selectedAccountId || isSwitching) return;

    setIsSwitching(true);
    setSwitchError(null);

    const supabase = createClient();
    const { error } = await supabase.rpc("set_active_marketplace_account", {
      p_account_id: accountId,
    });

    if (error) {
      setSwitchError("Não foi possível trocar a conta. Tente novamente.");
      setIsSwitching(false);
      return;
    }

    setSelectedAccountId(accountId);
    setIsSwitching(false);
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
          <div className="flex flex-col gap-1 rounded-md border bg-background p-1">
            <Store className="size-3.5 shrink-0 text-muted-foreground" />
            {accounts.map((account) => (
              <button
                key={account.id}
                type="button"
                disabled={isSwitching}
                onClick={() => switchAccount(account.id)}
                className={`rounded px-2 py-1.5 text-left text-sm disabled:cursor-wait disabled:opacity-60 ${account.id === selectedAccountId ? "bg-accent font-medium" : "hover:bg-accent/60"}`}
              >
                {account.name}
              </button>
            ))}
            {switchError ? <p className="px-2 pb-1 text-xs text-destructive">{switchError}</p> : null}
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
