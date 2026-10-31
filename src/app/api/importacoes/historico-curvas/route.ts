import { NextResponse } from "next/server";

import { importHistoricalRanking } from "@/app/(main)/importar-dados/_lib/import-historical-ranking";
import { createClient } from "@/lib/supabase/server";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user)
    return NextResponse.json({ message: "Sessão inválida. Entre novamente para importar." }, { status: 401 });
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) return NextResponse.json({ message: "Selecione um arquivo XLSX." }, { status: 400 });
    if (!file.name.toLocaleLowerCase("pt-BR").endsWith(".xlsx") || file.size === 0 || file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ message: "Envie um arquivo XLSX de até 10 MB." }, { status: 400 });
    }
    const result = await importHistoricalRanking({
      buffer: Buffer.from(await file.arrayBuffer()),
      fileName: file.name,
      userId: user.id,
      supabase,
    });
    return NextResponse.json(result, { status: result.duplicate ? 409 : 200 });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Não foi possível importar o histórico." },
      { status: 500 },
    );
  }
}
