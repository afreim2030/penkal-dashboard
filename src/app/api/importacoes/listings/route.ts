import { NextResponse } from "next/server";

import { importListings } from "@/app/(main)/importar-dados/_lib/import-listings";
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
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ message: "Selecione um arquivo XLSX." }, { status: 400 });
    }
    if (!file.name.toLocaleLowerCase("pt-BR").endsWith(".xlsx")) {
      return NextResponse.json({ message: "Formato inválido. Envie somente um arquivo .xlsx." }, { status: 400 });
    }
    if (file.size === 0 || file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ message: "O arquivo deve ter até 10 MB e não pode estar vazio." }, { status: 400 });
    }

    const result = await importListings({
      buffer: Buffer.from(await file.arrayBuffer()),
      fileName: file.name,
      userId: user.id,
      supabase,
    });

    return NextResponse.json(result, { status: result.duplicate ? 409 : 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível processar o arquivo.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
