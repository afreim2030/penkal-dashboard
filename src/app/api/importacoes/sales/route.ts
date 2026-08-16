import { NextResponse } from "next/server";

import { importSales, type SalesFileInput } from "@/app/(main)/importar-dados/_lib/import-sales";
import { createClient } from "@/lib/supabase/server";

const IMPORT_BUCKET = "import-staging";
const MAX_FILES = 20;
const MAX_FILE_SIZE = 50 * 1024 * 1024;

interface StagedSaleFile {
  path: string;
  fileName: string;
}

export const runtime = "nodejs";
export const maxDuration = 300;

function isStagedSaleFile(value: unknown): value is StagedSaleFile {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.path === "string" && typeof candidate.fileName === "string";
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ message: "Sessão inválida. Entre novamente para importar." }, { status: 401 });
  }

  let stagedFiles: StagedSaleFile[] = [];

  try {
    const body = (await request.json()) as { files?: unknown };
    if (!Array.isArray(body.files) || !body.files.length || !body.files.every(isStagedSaleFile)) {
      return NextResponse.json({ message: "Selecione ao menos um arquivo XLSX." }, { status: 400 });
    }

    stagedFiles = body.files;
    if (stagedFiles.length > MAX_FILES) {
      return NextResponse.json({ message: `Selecione no máximo ${MAX_FILES} arquivos por lote.` }, { status: 400 });
    }

    const userPrefix = `${user.id}/`;
    if (
      stagedFiles.some(
        (file) =>
          !file.path.startsWith(userPrefix) ||
          !file.fileName.toLocaleLowerCase("pt-BR").endsWith(".xlsx") ||
          file.fileName.length > 255,
      )
    ) {
      return NextResponse.json({ message: "Arquivo de vendas inválido." }, { status: 400 });
    }

    const files: SalesFileInput[] = [];
    for (const stagedFile of stagedFiles) {
      const { data, error } = await supabase.storage.from(IMPORT_BUCKET).download(stagedFile.path);
      if (error || !data) {
        throw new Error(`Não foi possível ler o arquivo temporário ${stagedFile.fileName}.`);
      }
      if (data.size === 0 || data.size > MAX_FILE_SIZE) {
        throw new Error(`O arquivo ${stagedFile.fileName} deve ter até 50 MB e não pode estar vazio.`);
      }
      files.push({
        buffer: Buffer.from(await data.arrayBuffer()),
        fileName: stagedFile.fileName,
      });
    }

    const result = await importSales({ files, userId: user.id, supabase });
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível processar os arquivos.";
    return NextResponse.json({ message }, { status: 500 });
  } finally {
    const paths = stagedFiles.map((file) => file.path);
    if (paths.length) {
      await supabase.storage.from(IMPORT_BUCKET).remove(paths);
    }
  }
}
