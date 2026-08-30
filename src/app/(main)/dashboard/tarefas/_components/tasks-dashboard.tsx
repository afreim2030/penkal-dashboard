import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { createTask, updateTaskStatus } from "../_actions/task-actions";
import type { OperationalTask, TaskPriority, TaskStatus } from "../_lib/load-operational-tasks";

const statusLabel: Record<TaskStatus, string> = {
  pending: "Pendente",
  in_progress: "Em andamento",
  completed: "Concluída",
};
const priorityLabel: Record<TaskPriority, string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  critical: "Crítica",
};
const priorityVariant: Record<TaskPriority, "default" | "secondary" | "destructive" | "outline"> = {
  low: "outline",
  medium: "secondary",
  high: "default",
  critical: "destructive",
};
function TaskCard({ task }: { task: OperationalTask }) {
  const next = task.status === "pending" ? "in_progress" : task.status === "in_progress" ? "completed" : null;
  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium">{task.title}</p>
          <Badge variant={priorityVariant[task.priority]}>{priorityLabel[task.priority]}</Badge>
          <Badge variant="outline">{statusLabel[task.status]}</Badge>
        </div>
        {task.description ? <p className="mt-1 text-muted-foreground text-sm">{task.description}</p> : null}
        <p className="mt-2 text-muted-foreground text-xs">
          {task.category}
          {task.dueDate ? ` · prazo ${task.dueDate.split("-").reverse().join("/")}` : ""}
        </p>
      </div>
      {next ? (
        <form action={updateTaskStatus}>
          <input type="hidden" name="id" value={task.id} />
          <input type="hidden" name="status" value={next} />
          <Button size="sm" type="submit">
            {next === "in_progress" ? "Iniciar tarefa" : "Concluir tarefa"}
          </Button>
        </form>
      ) : (
        <span className="text-muted-foreground text-sm">Finalizada</span>
      )}
    </div>
  );
}
export function TasksDashboard({ tasks }: { tasks: OperationalTask[] }) {
  const counts = {
    pending: tasks.filter((t) => t.status === "pending").length,
    in_progress: tasks.filter((t) => t.status === "in_progress").length,
    completed: tasks.filter((t) => t.status === "completed").length,
  };
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Tarefas</h1>
        <p className="text-muted-foreground text-sm">Ações operacionais derivadas dos alertas do painel.</p>
      </div>
      <Card><CardHeader><CardTitle>Nova tarefa</CardTitle><CardDescription>Registre uma ação própria da operação.</CardDescription></CardHeader><CardContent><form action={createTask} className="grid gap-3 md:grid-cols-4"><input className="h-9 rounded-md border bg-background px-3 text-sm md:col-span-2" name="title" placeholder="Título da tarefa" required /><input className="h-9 rounded-md border bg-background px-3 text-sm" name="dueDate" type="date" /><select className="h-9 rounded-md border bg-background px-3 text-sm" defaultValue="medium" name="priority"><option value="low">Prioridade baixa</option><option value="medium">Prioridade média</option><option value="high">Prioridade alta</option><option value="critical">Prioridade crítica</option></select><textarea className="min-h-20 rounded-md border bg-background px-3 py-2 text-sm md:col-span-3" name="description" placeholder="Descrição (opcional)" /><Button type="submit">Criar tarefa</Button></form></CardContent></Card>
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Pendentes</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{counts.pending}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Em andamento</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{counts.in_progress}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Concluídas</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{counts.completed}</CardTitle>
          </CardHeader>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Lista de tarefas</CardTitle>
          <CardDescription>Atualize o status conforme a operação avança.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {tasks.length ? (
            tasks.map((task) => <TaskCard key={task.id} task={task} />)
          ) : (
            <p className="text-muted-foreground text-sm">
              Nenhuma tarefa criada. Novos alertas poderão gerar tarefas automaticamente.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
