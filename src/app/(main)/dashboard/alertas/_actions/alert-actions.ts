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
  const { error } = await supabase
    .from("alert_resolutions")
    .upsert({ alert_key: alertKey, resolved_by: data.user.id }, { onConflict: "alert_key" });
  if (error) throw new Error("Não foi possível resolver o alerta.");
  revalidatePath("/dashboard/alertas");
  revalidatePath("/dashboard/tarefas");
}
