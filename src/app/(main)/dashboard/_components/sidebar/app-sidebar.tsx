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
          <p className="mb-1 px-2 text-muted-foreground text-xs">Conta ativa</p>
          <div className="flex flex-col gap-1 rounded-md border bg-background p-1">
            <Store className="size-3.5 shrink-0 text-muted-foreground" />
            {accounts.map((account) => (
              <a
                key={account.id}
                href={`/api/contas/selecionar?account=${account.id}&next=/dashboard/default`}
                className={`rounded px-2 py-1.5 text-sm ${account.id === activeAccountId ? "bg-accent font-medium" : "hover:bg-accent/60"}`}
              >
                {account.name}
              </a>
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

@@@
import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const accountId = request.nextUrl.searchParams.get("account");
  const next = request.nextUrl.searchParams.get("next") ?? "/dashboard/default";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard/default";

  if (!accountId) return NextResponse.redirect(new URL(safeNext, request.url));

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.redirect(new URL("/auth/v1/login", request.url));

  const { error } = await supabase.rpc("set_active_marketplace_account", { p_account_id: accountId });
  if (error) return NextResponse.redirect(new URL(`${safeNext}?account-error=1`, request.url));

  return NextResponse.redirect(new URL(safeNext, request.url));
}

@@@
