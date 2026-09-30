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
