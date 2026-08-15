import { NextResponse } from "next/server";

import { consolidateInboundsResults, importInboundsFile } from "@/app/(main)/importar-dados/_lib/import-inbounds";
import type { InboundsFileImportResult } from "@/app/(main)/importar-dados/_lib/inbounds-import-types";
import { createClient } from "@/lib/supabase/server";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_FILES = 20;

export const runtime = "nodejs";

function failedFile(fileName: string, message: string): InboundsFileImportResult {
  return {
    fileName,
    success: false,
    duplicateFile: false,
    inboundIds: [],
    recordsProcessed: 0,
    insertedRows: 0,
    existingRows: 0,
    historicalConflicts: 0,
    identifiedSkus: 0,
    unidentifiedSkus: 0,
    identifiedMlbs: 0,
    unidentifiedMlbs: 0,
    unitsDeclared: 0,
    unitsProcessed: 0,
    unitsDifference: 0,
    unitsSellable: 0,
    unitsUnsellable: 0,
    unitsUnidentified: 0,
    errors: 1,
    problems: [{ fileName, line: 0, message, severity: "error" }],
  };
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

  try {
    const formData = await request.formData();
    const files = formData.getAll("files").filter((value): value is File => value instanceof File);
    if (files.length === 0) {
      return NextResponse.json({ message: "Selecione pelo menos um arquivo CSV." }, { status: 400 });
    }
    if (files.length > MAX_FILES) {
      return NextResponse.json({ message: `Selecione no máximo ${MAX_FILES} arquivos por operação.` }, { status: 400 });
    }
    const invalid = files.find(
      (file) => !file.name.toLocaleLowerCase("pt-BR").endsWith(".csv") || file.size === 0 || file.size > MAX_FILE_SIZE,
    );
    if (invalid) {
      return NextResponse.json(
        { message: `Arquivo inválido: ${invalid.name}. Cada CSV deve ter até 10 MB e não pode estar vazio.` },
        { status: 400 },
      );
    }

    const results: InboundsFileImportResult[] = [];
    for (const file of files) {
      try {
        results.push(
          await importInboundsFile({
            buffer: Buffer.from(await file.arrayBuffer()),
            fileName: file.name,
            userId: user.id,
            supabase,
          }),
        );
      } catch (error) {
        results.push(
          failedFile(file.name, error instanceof Error ? error.message : "Não foi possível processar o arquivo."),
        );
      }
    }
    return NextResponse.json(consolidateInboundsResults(results));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível processar os arquivos.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
