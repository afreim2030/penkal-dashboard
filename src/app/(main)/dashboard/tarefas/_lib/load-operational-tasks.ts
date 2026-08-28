import { createClient } from "@/lib/supabase/server";
export type TaskStatus="pending"|"in_progress"|"completed";
export type TaskPriority="low"|"medium"|"high"|"critical";
export interface OperationalTask { id:string; title:string; description:string|null; category:string; priority:TaskPriority; status:TaskStatus; alertId:string|null; dueDate:string|null; createdAt:string; completedAt:string|null; }
export async function loadOperationalTasks():Promise<OperationalTask[]> { const supabase=await createClient(); const {data,error}=await supabase.rpc("get_operational_tasks"); if(error) throw new Error(`Não foi possível carregar as tarefas: ${error.message}`); return (Array.isArray(data)?data:[]) as OperationalTask[]; }
