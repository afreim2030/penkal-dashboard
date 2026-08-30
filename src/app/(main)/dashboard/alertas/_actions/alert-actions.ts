"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

async function requireUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  return supabase;
}

export async function resolveAlert(formData: FormData) {
  const alertKey = String(formData.get("alertKey") ?? "").trim();
  if (!alertKey) return;

  const supabase = await requireUser();
  const { data } = await supabase.auth.getUser();

  const { error: resolutionError } = await supabase
    .from("alert_resolutions")
    .upsert({ alert_key: alertKey, resolved_by: data.user!.id }, { onConflict: "alert_key" });
  if (resolutionError) throw new Error("Não foi possível resolver o alerta.");

  const { error: taskError } = await supabase
    .from("operational_tasks")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("alert_id", alertKey)
    .neq("status", "completed");
  if (taskError) throw new Error("Alerta resolvido, mas não foi possível atualizar a tarefa vinculada.");

  revalidatePath("/dashboard/alertas");
  revalidatePath("/dashboard/tarefas");
}

export async function reopenAlert(formData: FormData) {
  const alertKey = String(formData.get("alertKey") ?? "").trim();
  if (!alertKey) return;

  const supabase = await requireUser();
  const { error } = await supabase.from("alert_resolutions").delete().eq("alert_key", alertKey);
  if (error) throw new Error("Não foi possível reabrir o alerta.");

  await supabase.from("operational_tasks").update({ status: "pending", completed_at: null }).eq("alert_id", alertKey);

  revalidatePath("/dashboard/alertas");
  revalidatePath("/dashboard/tarefas");
}
