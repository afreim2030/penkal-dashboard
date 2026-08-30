"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
export async function updateTaskStatus(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!id || !["pending", "in_progress", "completed"].includes(status)) return;
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  const { error } = await supabase
    .from("operational_tasks")
    .update({ status, completed_at: status === "completed" ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) throw new Error("Não foi possível atualizar a tarefa.");
  revalidatePath("/dashboard/tarefas");
}

export async function createTask(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const priority = String(formData.get("priority") ?? "medium");
  const dueDate = String(formData.get("dueDate") ?? "").trim() || null;
  if (!title || !["low", "medium", "high", "critical"].includes(priority)) return;
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  const { error } = await supabase.from("operational_tasks").insert({
    title,
    description,
    priority,
    due_date: dueDate,
    created_by: data.user.id,
  });
  if (error) throw new Error("Não foi possível criar a tarefa.");
  revalidatePath("/dashboard/tarefas");
}
