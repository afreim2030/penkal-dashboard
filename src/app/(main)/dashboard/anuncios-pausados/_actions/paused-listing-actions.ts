"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export async function setPausedListingTag(listingId: string, tag: "ok" | "sem_estoque" | null) {
  const supabase = await createClient();
  const { error } = await supabase.from("listings").update({ paused_tag: tag }).eq("id", listingId);
  if (error) throw new Error("Não foi possível atualizar a tag: " + error.message);
  revalidatePath("/dashboard/anuncios-pausados");
}

export async function updatePausedListingSku(productId: string, sku: string) {
  const nextSku = sku.trim();
  if (!nextSku) throw new Error("Informe o SKU.");

  const supabase = await createClient();
  const { data: existing, error: existingError } = await supabase
    .from("products")
    .select("id")
    .eq("sku", nextSku)
    .maybeSingle();

  if (existingError) throw new Error("Não foi possível validar o SKU: " + existingError.message);
  if (existing && existing.id !== productId) throw new Error("Já existe um produto com este SKU nesta conta.");

  const { error } = await supabase
    .from("products")
    .update({ sku: nextSku, updated_at: new Date().toISOString() })
    .eq("id", productId);

  if (error) throw new Error("Não foi possível atualizar o SKU: " + error.message);
  revalidatePath("/dashboard/anuncios-pausados");
}
