"use client";

import { useState } from "react";

import { Bot, Loader2, Send, Sparkles } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const QUICK_QUESTIONS = [
  "O que merece mais atenção na operação agora?",
  "Quais SKUs eu deveria acompanhar hoje e por quê?",
  "Onde estão as maiores oportunidades de venda com os dados disponíveis?",
];

export function AiDashboard({ enabled }: { enabled: boolean }) {
  const [question, setQuestion] = useState(QUICK_QUESTIONS[0]);
  const [answer, setAnswer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function analyze(value?: string) {
    const prompt = (value ?? question).trim();
    if (!prompt || loading) return;
    setQuestion(prompt);
    setLoading(true);
    setError(null);
    setAnswer(null);
    try {
      const response = await fetch("/api/ai/analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: prompt }),
      });
      const payload = (await response.json()) as { answer?: string; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível gerar a análise.");
      setAnswer(payload.answer ?? "A análise terminou sem texto.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível gerar a análise.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">IA</h1>
          <Badge variant="outline">análise interna</Badge>
        </div>
        <p className="text-muted-foreground text-sm">
          Pergunte sobre vendas, produtos, estoque FULL, envios e publicidade usando os dados já carregados no painel.
        </p>
      </div>

      {!enabled ? (
        <Alert>
          <Sparkles />
          <AlertTitle>Integração preparada</AlertTitle>
          <AlertDescription>
            Falta apenas configurar <code>OPENAI_API_KEY</code> no ambiente do servidor para liberar as análises.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bot className="size-5" /> Pergunte ao analista
            </CardTitle>
            <CardDescription>
              A IA recebe um resumo estruturado da operação. Dados ausentes continuam ausentes; nenhum SKU ou estoque é
              inventado.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <textarea
              className="min-h-28 w-full resize-y rounded-lg border bg-background px-3 py-2 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              maxLength={2000}
              placeholder="Ex.: compare o último dia completo com a semana anterior e me diga onde agir primeiro."
            />
            <div className="flex justify-end">
              <Button onClick={() => analyze()} disabled={!enabled || loading || !question.trim()}>
                {loading ? <Loader2 className="animate-spin" /> : <Send />}
                {loading ? "Analisando..." : "Analisar operação"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Perguntas rápidas</CardTitle>
            <CardDescription>Atalhos para análises recorrentes.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {QUICK_QUESTIONS.map((item) => (
              <Button
                key={item}
                variant="outline"
                className="h-auto justify-start whitespace-normal py-3 text-left"
                disabled={!enabled || loading}
                onClick={() => analyze(item)}
              >
                {item}
              </Button>
            ))}
          </CardContent>
        </Card>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Não foi possível concluir a análise</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {answer ? (
        <Card>
          <CardHeader>
            <CardTitle>Análise</CardTitle>
            <CardDescription>Gerada a partir do estado atual do painel.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="whitespace-pre-wrap text-sm leading-6">{answer}</div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
