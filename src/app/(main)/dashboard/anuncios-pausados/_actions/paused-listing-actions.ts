"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export async function setPausedListingTag(listingId: string, tag: "ok" | "sem_estoque" | null) {
  const supabase = await createClient();
  const { error } = await supabase.from("listings").update({ paused_tag: tag }).eq("id", listingId);
  if (error) return { error: "Não foi possível atualizar a tag: " + error.message };
  revalidatePath("/dashboard/anuncios-pausados");
  return { error: null };
}

export async function updatePausedListingSku(productId: string, currentSku: string | null, sku: string) {
  const nextSku = sku.trim();
  if (!nextSku) return { error: "Informe o SKU." };
  if (nextSku === (currentSku ?? "").trim()) return { error: null };

  try {
    const supabase = await createClient();
    const { data: existing, error: existingError } = await supabase
      .from("products")
      .select("id")
      .eq("sku", nextSku)
      .maybeSingle();

    if (existingError) return { error: "Não foi possível validar o SKU: " + existingError.message };
    if (existing && existing.id !== productId) return { error: "Já existe outro produto com este SKU nesta conta." };

    const { error } = await supabase
      .from("products")
      .update({ sku: nextSku, updated_at: new Date().toISOString() })
      .eq("id", productId);

    if (error) return { error: "Não foi possível atualizar o SKU: " + error.message };
    revalidatePath("/dashboard/anuncios-pausados");
    return { error: null };
  } catch {
    return { error: "Não foi possível atualizar o SKU." };
  }
}
