"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { read, utils } from "xlsx";

export async function saveUnitCost(formData: FormData) {
  const productId = String(formData.get("productId") ?? "");
  const unitCost = Number(String(formData.get("unitCost") ?? "").replace(",", "."));
  if (!productId || !Number.isFinite(unitCost) || unitCost < 0) throw new Error("Informe um custo válido.");
  const supabase = await createClient();
  const { data: active, error: activeError } = await supabase.rpc("get_active_marketplace_account_id");
  if (activeError || !active) throw new Error("Não foi possível identificar a conta ativa.");
  const { error } = await supabase.from("product_costs").upsert({ account_id: active, product_id: productId, unit_cost: unitCost, updated_at: new Date().toISOString() }, { onConflict: "account_id,product_id" });
  if (error) throw new Error("Não foi possível salvar o custo.");
  revalidatePath("/dashboard/lucro");
}

export async function importUnitCosts(formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".xlsx")) throw new Error("Envie uma planilha XLSX.");
  const rows = utils.sheet_to_json<Record<string, unknown>>(read(Buffer.from(await file.arrayBuffer()), { type: "buffer" }).Sheets[read(Buffer.from(await file.arrayBuffer()), { type: "buffer" }).SheetNames[0]], { defval: "" });
  const supabase = await createClient(); const { data: account } = await supabase.rpc("get_active_marketplace_account_id");
  if (!account) throw new Error("Não foi possível identificar a conta ativa.");
  const { data: products } = await supabase.from("products").select("id,sku").eq("account_id", account);
  const bySku = new Map((products ?? []).map((p) => [p.sku.trim(), p.id]));
  const values = rows.flatMap((row) => { const sku = String(row["SKU"] ?? "").trim(); const raw = String(row["CUSTO UNITÁRIO"] ?? row["CUSTO_UNITARIO"] ?? row["CUSTO"] ?? "").replace(".", "").replace(",", "."); const cost = Number(raw); const productId = bySku.get(sku); return productId && Number.isFinite(cost) && cost >= 0 ? [{ account_id: account, product_id: productId, unit_cost: cost, updated_at: new Date().toISOString() }] : []; });
  if (!values.length) throw new Error("Nenhum custo válido encontrado. Use as colunas SKU e CUSTO UNITÁRIO.");
  const { error } = await supabase.from("product_costs").upsert(values, { onConflict: "account_id,product_id" });
  if (error) throw new Error("Não foi possível importar os custos.");
  revalidatePath("/dashboard/lucro");
}
