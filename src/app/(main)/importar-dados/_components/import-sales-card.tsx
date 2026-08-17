"use client";

import { useRef, useState } from "react";

import { AlertCircle, CheckCircle2, FileSpreadsheet, Upload } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { createClient } from "@/lib/supabase/client";

import type { SalesImportResult } from "../_lib/sales-import-types";

const IMPORT_BUCKET = "import-staging";
const MAX_FILES = 20;
const MAX_FILE_SIZE = 50 * 1024 * 1024;
const XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

interface StagedSaleFile {
  path: string;
  fileName: string;
}

function unknownErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    const serialized = JSON.stringify(error);
    if (serialized && serialized !== "{}") return serialized;
  } catch {
    // Ignora e usa a mensagem padrão abaixo.
  }
  return "Falha inesperada antes de concluir o envio dos arquivos.";
}

export function ImportSalesCard() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingMessage, setProcessingMessage] = useState("Processando vendas...");
  const [result, setResult] = useState<SalesImportResult | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);

  async function handleImport() {
    if (!files.length || isProcessing) return;
    setResult(null);
    setRequestError(null);

    if (files.length > MAX_FILES) {
      setRequestError(`Selecione no máximo ${MAX_FILES} arquivos por lote.`);
      return;
    }
    const invalidFile = files.find(
      (file) => !file.name.toLocaleLowerCase("pt-BR").endsWith(".xlsx") || file.size === 0 || file.size > MAX_FILE_SIZE,
    );
    if (invalidFile) {
      setRequestError(`O arquivo ${invalidFile.name} deve ser XLSX, ter até 50 MB e não pode estar vazio.`);
      return;
    }

    for (const file of files) {
      try {
        await file.slice(0, Math.min(1, file.size)).arrayBuffer();
      } catch {
        setRequestError(
          `O navegador não conseguiu ler o arquivo ${file.name}. Extraia os arquivos do ZIP para uma pasta normal do computador e selecione-os novamente.`,
        );
        return;
      }
    }

    setIsProcessing(true);
    const supabase = createClient();
    const staged: StagedSaleFile[] = [];

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) throw new Error("Sessão inválida. Entre novamente para importar.");

      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        setProcessingMessage(`Enviando arquivo ${index + 1} de ${files.length}...`);
        const path = `${user.id}/${crypto.randomUUID()}.xlsx`;
        const { error: uploadError } = await supabase.storage.from(IMPORT_BUCKET).upload(path, file, {
          cacheControl: "0",
          contentType: file.type || XLSX_CONTENT_TYPE,
          upsert: false,
        });
        if (uploadError) {
          throw new Error(`Não foi possível enviar o arquivo ${file.name}: ${uploadError.message}`);
        }
        staged.push({ path, fileName: file.name });
      }

      setProcessingMessage("Processando vendas...");
      const response = await fetch("/api/importacoes/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files: staged }),
      });
      const payload = (await response.json()) as SalesImportResult | { message?: string };
      if (!response.ok) {
        setRequestError(payload.message ?? "Não foi possível importar os arquivos.");
        return;
      }
      setResult(payload as SalesImportResult);
    } catch (error) {
      setRequestError(unknownErrorMessage(error));
    } finally {
      if (staged.length) {
        await supabase.storage.from(IMPORT_BUCKET).remove(staged.map((file) => file.path));
      }
      setProcessingMessage("Processando vendas...");
      setIsProcessing(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <FileSpreadsheet className="mt-0.5 size-5 text-muted-foreground" aria-hidden="true" />
          <div className="flex flex-col gap-1">
            <CardTitle>Vendas</CardTitle>
            <CardDescription>Relatórios de vendas do Mercado Livre</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="sales-file">Arquivos XLSX</FieldLabel>
            <Input
              ref={inputRef}
              id="sales-file"
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              multiple
              className="sr-only"
              disabled={isProcessing}
              onChange={(event) => {
                setFiles(Array.from(event.target.files ?? []));
                setResult(null);
                setRequestError(null);
              }}
            />
            <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
              <Button type="button" variant="outline" disabled={isProcessing} onClick={() => inputRef.current?.click()}>
                <Upload data-icon="inline-start" />
                Selecionar arquivos
              </Button>
              <p className="max-w-full truncate text-muted-foreground text-sm" aria-live="polite">
                {files.length === 0
                  ? "Nenhum arquivo selecionado"
                  : files.length +
                    " arquivo" +
                    (files.length === 1 ? "" : "s") +
                    " selecionado" +
                    (files.length === 1 ? "" : "s")}
              </p>
            </div>
            <FieldDescription>
              Somente .xlsx, até 50 MB por arquivo e no máximo 20 arquivos. O envio temporário é privado e removido após
              o processamento.
            </FieldDescription>
          </Field>
        </FieldGroup>

        {isProcessing && (
          <Alert>
            <Spinner />
            <AlertTitle>{processingMessage}</AlertTitle>
            <AlertDescription>Arquivos grandes podem levar alguns instantes.</AlertDescription>
          </Alert>
        )}
        {requestError && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertTitle>Não foi possível concluir</AlertTitle>
            <AlertDescription>{requestError}</AlertDescription>
          </Alert>
        )}
        {result && (
          <Alert variant={result.totals.errors ? "destructive" : undefined}>
            {result.totals.errors ? <AlertCircle /> : <CheckCircle2 />}
            <AlertTitle>
              {result.totals.errors ? "Importação concluída com pendências" : "Importação concluída"}
            </AlertTitle>
            <AlertDescription>
              <dl className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
                <div>Linhas: {result.totals.rows}</div>
                <div>Itens de venda: {result.totals.saleItems}</div>
                <div>Novas: {result.totals.insertedRows}</div>
                <div>Atualizadas: {result.totals.updatedRows}</div>
                <div>Duplicadas exatas: {result.totals.exactDuplicates}</div>
                <div>Versões antigas ignoradas: {result.totals.oldIgnoredRows}</div>
                <div>Conflitos: {result.totals.conflicts}</div>
                <div>Erros: {result.totals.errors}</div>
              </dl>
              <div className="mt-3 flex flex-col gap-3">
                {result.files.map((fileResult) => (
                  <div key={fileResult.fileName} className="rounded-md border p-3 text-sm">
                    <p className="truncate font-medium" title={fileResult.fileName}>
                      {fileResult.fileName}
                    </p>
                    <p className="text-muted-foreground">
                      Período: {fileResult.periodStart ?? "não encontrado"} — {fileResult.periodEnd ?? "não encontrado"}
                    </p>
                    <p className="text-muted-foreground">
                      Exportado em: {fileResult.sourceExportedAt ?? "não informado"}
                    </p>
                    <p>
                      Novas {fileResult.insertedRows} · Atualizadas {fileResult.updatedRows} · Duplicadas{" "}
                      {fileResult.exactDuplicates} · Antigas {fileResult.oldIgnoredRows} · Conflitos{" "}
                      {fileResult.conflicts}
                    </p>
                    {fileResult.problems.length > 0 && (
                      <ul className="mt-2 flex list-disc flex-col gap-1 pl-5">
                        {fileResult.problems.map((problem) => (
                          <li key={`${fileResult.fileName}-${problem.line}-${problem.message}`}>
                            {problem.line ? `Linha ${problem.line} — ` : ""}
                            {problem.message}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
      <CardFooter className="justify-end">
        <Button type="button" disabled={!files.length || isProcessing} onClick={handleImport}>
          {isProcessing ? <Spinner data-icon="inline-start" /> : <Upload data-icon="inline-start" />}
          Importar
        </Button>
      </CardFooter>
    </Card>
  );
}
