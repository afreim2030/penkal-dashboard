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

const accountButtons = [
  { id: "5ec7156d-4899-4e99-bd79-e9ff7056c522", label: "PENKAL" },
  { id: "8c5756df-727c-4993-b85c-ae18714aa004", label: "SÃO PAULO" },
];

export function AppSidebar({ accounts, activeAccountId, ...props }: React.ComponentProps<typeof Sidebar> & { accounts: MarketplaceAccount[]; activeAccountId: string | null }) {
  const router = useRouter();
  const activeAccountLabel = accountButtons.find((account) => account.id === activeAccountId)?.label ?? "—";

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
          <p className="mb-2 px-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400">✓ VISUALIZANDO: {activeAccountLabel}</p>
          <div className="flex flex-col gap-2 rounded-md border bg-background p-2">
            <Store className="ml-1 size-3.5 shrink-0 text-muted-foreground" />
            {accountButtons.map((account) => (
              <form key={account.id} action={switchMarketplaceAccount.bind(null, account.id)}>
                <button
                  type="submit"
                  className={`w-full rounded-md border px-3 py-2 text-left text-sm font-semibold ${account.id === activeAccountId ? "border-emerald-500 bg-emerald-600 text-white shadow-sm hover:bg-emerald-600" : "bg-background text-muted-foreground hover:bg-accent hover:text-foreground"}`}
                >
                  {account.id === activeAccountId ? `✓ ${account.label} — VISUALIZANDO` : account.label}
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
