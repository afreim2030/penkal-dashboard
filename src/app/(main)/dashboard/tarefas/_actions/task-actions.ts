"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
export async function updateTaskStatus(formData:FormData){const id=String(formData.get("id")??"");const status=String(formData.get("status")??"");if(!id||!["pending","in_progress","completed"].includes(status))return;const supabase=await createClient();const {data}=await supabase.auth.getUser();if(!data.user)redirect("/login");const {error}=await supabase.from("operational_tasks").update({status,completed_at:status==="completed"?new Date().toISOString():null}).eq("id",id);if(error)throw new Error("Não foi possível atualizar a tarefa.");revalidatePath("/dashboard/tarefas");}
