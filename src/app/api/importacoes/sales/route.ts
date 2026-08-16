import { NextResponse } from "next/server";

import { importSales } from "@/app/(main)/importar-dados/_lib/import-sales";
import { createClient } from "@/lib/supabase/server";

const MAX_FILE_SIZE = 10 * 1024 * 1024;

export const runtime = "nodejs";

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
    const files = formData.getAll("files").length ? formData.getAll("files") : [formData.get("file")];
    if (!files.length || files.some((file) => !(file instanceof File))) {
      return NextResponse.json({ message: "Selecione ao menos um arquivo XLSX." }, { status: 400 });
    }
    const uploadFiles = files as File[];
    if (uploadFiles.some((file) => !file.name.toLocaleLowerCase("pt-BR").endsWith(".xlsx"))) {
      return NextResponse.json({ message: "Formato inválido. Envie somente arquivos .xlsx." }, { status: 400 });
    }
    if (uploadFiles.some((file) => file.size === 0 || file.size > MAX_FILE_SIZE)) {
      return NextResponse.json({ message: "Cada arquivo deve ter até 10 MB e não pode estar vazio." }, { status: 400 });
    }

    const result = await importSales({
      files: await Promise.all(
        uploadFiles.map(async (file) => ({
          buffer: Buffer.from(await file.arrayBuffer()),
          fileName: file.name,
        })),
      ),
      userId: user.id,
      supabase,
    });
    return NextResponse.json(result, { status: result.success || result.duplicate ? 200 : 409 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível processar o arquivo.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
