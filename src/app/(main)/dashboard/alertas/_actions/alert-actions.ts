"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

async function requireUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  return { supabase, user: data.user };
}

export async function resolveAlert(formData: FormData) {
  const alertKey = String(formData.get("alertKey") ?? "").trim();
  if (!alertKey) return;
  const { supabase, user } = await requireUser();
  const { data: accountId, error: accountError } = await supabase.rpc("get_active_marketplace_account_id");
  if (accountError || !accountId) throw new Error("Não foi possível identificar a conta ativa.");

  const { error: resolutionError } = await supabase
    .from("alert_resolutions")
    .upsert({ alert_key: alertKey, resolved_by: user.id, account_id: accountId }, { onConflict: "alert_key" });
  if (resolutionError) throw new Error("Não foi possível resolver o alerta.");

  const { error: taskError } = await supabase
    .from("operational_tasks")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("alert_key", alertKey)
    .eq("account_id", accountId)
    .neq("status", "completed");
  if (taskError) throw new Error("Alerta resolvido, mas não foi possível atualizar a tarefa vinculada.");

  revalidatePath("/dashboard/alertas");
  revalidatePath("/dashboard/tarefas");
}

export async function reopenAlert(formData: FormData) {
  const alertKey = String(formData.get("alertKey") ?? "").trim();
  if (!alertKey) return;
  const { supabase } = await requireUser();
  const { data: accountId, error: accountError } = await supabase.rpc("get_active_marketplace_account_id");
  if (accountError || !accountId) throw new Error("Não foi possível identificar a conta ativa.");

  const { error } = await supabase.from("alert_resolutions").delete().eq("alert_key", alertKey).eq("account_id", accountId);
  if (error) throw new Error("Não foi possível reabrir o alerta.");

  const { error: taskError } = await supabase
    .from("operational_tasks")
    .update({ status: "pending", completed_at: null })
    .eq("alert_key", alertKey)
    .eq("account_id", accountId);
  if (taskError) throw new Error("Alerta reaberto, mas não foi possível atualizar a tarefa vinculada.");

  revalidatePath("/dashboard/alertas");
  revalidatePath("/dashboard/tarefas");
}
