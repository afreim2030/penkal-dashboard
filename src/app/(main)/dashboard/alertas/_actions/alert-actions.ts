"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export async function resolveAlert(formData: FormData) {
  const alertKey = String(formData.get("alertKey") ?? "").trim();
  if (!alertKey) return;

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");

  const { error: resolutionError } = await supabase
    .from("alert_resolutions")
    .upsert({ alert_key: alertKey, resolved_by: data.user.id }, { onConflict: "alert_key" });

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
