"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

function destination(kind: "success" | "error", message: string) {
  return `/dashboard/vinculos?${kind}=${encodeURIComponent(message)}`;
}

export async function saveIdentifierOverride(formData: FormData) {
  const identifierType = String(formData.get("identifierType") ?? "");
  const rawValue = String(formData.get("rawValue") ?? "").trim();
  let targetValue = String(formData.get("targetValue") ?? "").trim().toUpperCase();

  if ((identifierType !== "sku" && identifierType !== "mlb") || !rawValue || !targetValue) {
    redirect(destination("error", "Preencha o identificador correto."));
  }

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) redirect(destination("error", "Sua sessão expirou. Entre novamente."));

  let targetProductId: string | null = null;
  let targetListingId: string | null = null;

  if (identifierType === "sku") {
    const { data: product, error } = await supabase.from("products").select("id").eq("sku", targetValue).maybeSingle();
    if (error || !product) redirect(destination("error", `O SKU ${targetValue} não existe no catálogo.`));
    targetProductId = product.id;
  } else {
    if (/^\d+$/.test(targetValue)) targetValue = `MLB${targetValue}`;
    const { data: listing, error } = await supabase
      .from("listings")
      .select("id")
      .eq("mlb", targetValue)
      .maybeSingle();
    if (error || !listing) redirect(destination("error", `O MLB ${targetValue} não existe no catálogo.`));
    targetListingId = listing.id;
  }

  const { error: overrideError } = await supabase.from("identifier_link_overrides").upsert(
    {
      identifier_type: identifierType,
      raw_value: rawValue,
      target_product_id: targetProductId,
      target_listing_id: targetListingId,
      created_by: authData.user.id,
    },
    { onConflict: "identifier_type,raw_value" },
  );

  if (overrideError) redirect(destination("error", "Não foi possível salvar o vínculo."));

  const { error: reconcileError } = await supabase.rpc("reconcile_data_links");
  if (reconcileError) redirect(destination("error", "O vínculo foi salvo, mas os dados não puderam ser reconciliados."));

  revalidatePath("/dashboard/vinculos");
  revalidatePath("/dashboard/vendas");
  revalidatePath("/dashboard/produtos");
  revalidatePath("/dashboard/estoque-full");
  redirect(destination("success", `${rawValue} foi vinculado a ${targetValue}.`));
}
