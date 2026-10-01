"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function excludeProduct(sku: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("products").update({ excluded_at: new Date().toISOString() }).eq("sku", sku).is("excluded_at", null);
  if (error) throw new Error("Não foi possível excluir o anúncio: " + error.message);
  revalidatePath("/dashboard/produtos");
}
