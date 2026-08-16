import { NextResponse } from "next/server";

import { loadAlertsDashboard } from "@/app/(main)/dashboard/alertas/_lib/load-alerts-dashboard";
import { loadAdsDashboard } from "@/app/(main)/dashboard/publicidade/_lib/load-ads-dashboard";
import { loadMainDashboard } from "@/app/(main)/dashboard/default/_lib/load-main-dashboard";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function extractOutputText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const value = payload as {
    output_text?: unknown;
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  };
  if (typeof value.output_text === "string") return value.output_text.trim();
  return (value.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((item) => item.type === "output_text" && typeof item.text === "string")
    .map((item) => item.text as string)
    .join("\n")
    .trim();
}

function compactContext(
  dashboard: NonNullable<Awaited<ReturnType<typeof loadMainDashboard>>>,
  alerts: Awaited<ReturnType<typeof loadAlertsDashboard>>,
  ads: Awaited<ReturnType<typeof loadAdsDashboard>>,
) {
  const topAffected = [...dashboard.products.products]
    .filter((product) => product.stockTimeAffected > 0)
    .sort((left, right) => right.stockTimeAffected - left.stockTimeAffected)
    .slice(0, 12)
    .map((product) => ({
      sku: product.sku,
      name: product.name,
      fullStock: product.fullStock,
      stockTimeAffected: product.stockTimeAffected,
      unitsPeriod: product.unitsPeriod,
      daysSinceSale: product.daysSinceSale,
    }));

  const topSelling = [...dashboard.products.products]
    .sort((left, right) => right.unitsPeriod - left.unitsPeriod)
    .slice(0, 12)
    .map((product) => ({
      sku: product.sku,
      name: product.name,
      unitsPeriod: product.unitsPeriod,
      revenuePeriod: product.revenuePeriod,
      fullStock: product.fullStock,
      visits7: product.visits7,
      conversion7: product.conversion7,
    }));

  return {
    dataPolicy: {
      productIdentity: "SKU",
      stockTruth: "somente estoque FULL",
      timezone: "America/Sao_Paulo",
      comparisons: "somente dias com cobertura completa",
      missingSku: "não inventar vínculo",
    },
    sales: {
      coverage: dashboard.sales.coverage,
      latestDay: dashboard.sales.latestDay,
      previousDay: dashboard.sales.previousDay,
      sameWeekdayPreviousWeek: dashboard.sales.sameWeekdayPreviousWeek,
      periods: dashboard.sales.periods,
      topSkus: dashboard.sales.topSkus.slice(0, 12),
      strongestHours: [...dashboard.sales.hourly].sort((a, b) => b.units - a.units).slice(0, 8),
      weekdays: dashboard.sales.weekdays,
    },
    products: {
      asOf: dashboard.products.asOf,
      summary: dashboard.products.summary,
      topSelling,
      topAffected,
    },
    fullInbounds: {
      summary: dashboard.inbounds.summary,
      topDifferences: dashboard.inbounds.topDifferences.slice(0, 10),
    },
    ads: ads
      ? {
          period: ads.period,
          summary: ads.summary,
          campaigns: ads.campaigns.slice(0, 10),
        }
      : null,
    alerts: {
      summary: alerts.summary,
      items: alerts.alerts.slice(0, 15),
    },
  };
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "A IA está pronta, mas falta configurar OPENAI_API_KEY no ambiente do servidor." },
      { status: 503 },
    );
  }

  let question = "Analise a operação e diga o que merece atenção agora.";
  try {
    const body = (await request.json()) as { question?: unknown };
    if (typeof body.question === "string" && body.question.trim()) question = body.question.trim().slice(0, 2000);
  } catch {
    // Corpo vazio usa a pergunta padrão.
  }

  const [dashboard, alerts, ads] = await Promise.all([loadMainDashboard(), loadAlertsDashboard(), loadAdsDashboard()]);
  if (!dashboard) {
    return NextResponse.json({ error: "Ainda não há dados suficientes para montar o contexto da IA." }, { status: 422 });
  }

  const context = compactContext(dashboard, alerts, ads);
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-5.6",
      store: false,
      max_output_tokens: 1400,
      instructions:
        "Você é um analista de marketplace da Editora Penkal. Responda em português do Brasil. Use exclusivamente os dados estruturados fornecidos. Não invente SKU, estoque, visita, venda ou causa. Separe fatos de hipóteses. Quando faltar uma fonte, diga explicitamente que ela está ausente. Priorize ações práticas para Mercado Livre. Seja conciso, use títulos curtos e no máximo 6 prioridades.",
      input: `PERGUNTA DO USUÁRIO:\n${question}\n\nDADOS VERIFICADOS DO PAINEL:\n${JSON.stringify(context)}`,
    }),
  });

  const payload = (await response.json()) as unknown;
  if (!response.ok) {
    const errorPayload = payload as { error?: { message?: string } };
    return NextResponse.json(
      { error: errorPayload.error?.message || "A OpenAI não conseguiu gerar a análise." },
      { status: response.status },
    );
  }

  const answer = extractOutputText(payload);
  if (!answer) return NextResponse.json({ error: "A IA respondeu sem texto utilizável." }, { status: 502 });

  return NextResponse.json({ answer });
}
