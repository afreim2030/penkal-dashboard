import { NextResponse } from "next/server";
import { loadAlertsDashboard } from "@/app/(main)/dashboard/alertas/_lib/load-alerts-dashboard";
import { loadMainDashboard } from "@/app/(main)/dashboard/default/_lib/load-main-dashboard";
import { loadAdsDashboard } from "@/app/(main)/dashboard/publicidade/_lib/load-ads-dashboard";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function compactContext(dashboard: NonNullable<Awaited<ReturnType<typeof loadMainDashboard>>>, alerts: Awaited<ReturnType<typeof loadAlertsDashboard>>, ads: Awaited<ReturnType<typeof loadAdsDashboard>>) {
  const topAffected = [...dashboard.products.products].filter((product) => product.stockTimeAffected > 0).sort((left, right) => right.stockTimeAffected - left.stockTimeAffected).slice(0, 12).map((product) => ({ sku: product.sku, name: product.name, fullStock: product.fullStock, stockTimeAffected: product.stockTimeAffected, unitsPeriod: product.unitsPeriod, daysSinceSale: product.daysSinceSale }));
  const topSelling = [...dashboard.products.products].sort((left, right) => right.unitsPeriod - left.unitsPeriod).slice(0, 12).map((product) => ({ sku: product.sku, name: product.name, unitsPeriod: product.unitsPeriod, revenuePeriod: product.revenuePeriod, fullStock: product.fullStock, visits7: product.visits7, conversion7: product.conversion7 }));
  return { sales: { latestDay: dashboard.sales.latestDay }, products: { summary: dashboard.products.summary, topSelling, topAffected }, ads: ads ? { period: ads.period, summary: ads.summary } : null, alerts: { items: alerts.alerts.slice(0, 15) } };
}

type AnalysisContext = ReturnType<typeof compactContext>;
const integer = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const percent = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 });

function automaticAnalysis(question: string, context: AnalysisContext): string {
  const normalized = question.toLocaleLowerCase("pt-BR");
  const lines: string[] = ["RESUMO VERIFICADO"];
  const latest = context.sales.latestDay;
  if (latest.date) lines.push(`• Último dia completo: ${latest.date} — ${integer.format(latest.units)} unidades e ${currency.format(latest.revenue)}.`);
  lines.push(`• Catálogo: ${integer.format(context.products.summary.products)} SKUs; ${integer.format(context.products.summary.withFullStock)} com estoque FULL.`);
  if (context.ads?.period) lines.push(`• Publicidade: ${currency.format(context.ads.summary.investment)} investidos, ${currency.format(context.ads.summary.revenue)} de receita atribuída, ACOS ${context.ads.summary.acos === null ? "indisponível" : percent.format(context.ads.summary.acos)} e ROAS ${context.ads.summary.roas?.toFixed(2) ?? "indisponível"}x.`);
  lines.push("", "PRIORIDADES");
  if (normalized.includes("sku") || normalized.includes("produto")) {
    context.products.topSelling.slice(0, 6).forEach((item, index) => lines.push(`${index + 1}. SKU ${item.sku} — ${item.name}: ${integer.format(item.unitsPeriod)} unidades no período, ${integer.format(item.fullStock)} no FULL${item.conversion7 === null ? "" : `, conversão ${percent.format(item.conversion7)}`}.`));
  } else if (normalized.includes("oportunidade") || normalized.includes("venda")) {
    context.products.topSelling.filter((item) => item.fullStock > 0).slice(0, 6).forEach((item, index) => lines.push(`${index + 1}. SKU ${item.sku} — preservar disponibilidade: ${integer.format(item.unitsPeriod)} vendidas e ${integer.format(item.fullStock)} unidades no FULL.`));
  } else {
    const alertItems = context.alerts.items.slice(0, 4);
    alertItems.forEach((item, index) => lines.push(`${index + 1}. ${item.title} — ${item.description}`));
    const offset = alertItems.length;
    context.products.topAffected.slice(0, Math.max(0, 6 - offset)).forEach((item, index) => lines.push(`${offset + index + 1}. SKU ${item.sku} — ${integer.format(item.stockTimeAffected)} unidades afetando tempo de estoque; ${integer.format(item.unitsPeriod)} vendidas no período.`));
  }
  if (lines.at(-1) === "PRIORIDADES") lines.push("Nenhuma prioridade calculável com os dados disponíveis.");
  lines.push("", "A análise acima usa somente números presentes no painel e não presume causas.");
  return lines.join("\n");
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  let question = "Analise a operação e diga o que merece atenção agora.";
  try { const body = await request.json() as { question?: unknown }; if (typeof body.question === "string" && body.question.trim()) question = body.question.trim().slice(0, 2000); } catch { /* Corpo vazio usa a pergunta padrão. */ }
  const [dashboard, alerts, ads] = await Promise.all([loadMainDashboard(), loadAlertsDashboard(), loadAdsDashboard()]);
  if (!dashboard) return NextResponse.json({ error: "Ainda não há dados suficientes para montar a análise." }, { status: 422 });
  return NextResponse.json({ answer: automaticAnalysis(question, compactContext(dashboard, alerts, ads)), mode: "automatic" });
}
