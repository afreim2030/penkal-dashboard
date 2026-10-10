"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export async function updateProductSku(oldSku: string, nextSku: string) {
  const sku = nextSku.trim();

  if (!sku) throw new Error("Informe o SKU.");
  if (sku === oldSku) return;

  const supabase = await createClient();
  const { data: existing, error: existingError } = await supabase
    .from("products")
    .select("id")
    .eq("sku", sku)
    .maybeSingle();

  if (existingError) throw new Error("Não foi possível validar o SKU: " + existingError.message);
  if (existing) throw new Error("Já existe um produto com este SKU nesta conta.");

  const { data: updated, error } = await supabase
    .from("products")
    .update({ sku, updated_at: new Date().toISOString() })
    .eq("sku", oldSku)
    .select("id");

  if (error) throw new Error("Não foi possível atualizar o SKU: " + error.message);
  if (!updated?.length) throw new Error("Produto não encontrado nesta conta.");

  revalidatePath("/dashboard/produtos");
}
