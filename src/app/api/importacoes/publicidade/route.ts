import { NextResponse } from "next/server";
import { importAds, type AdsFileInput } from "@/app/(main)/importar-dados/_lib/import-ads";
import { createClient } from "@/lib/supabase/server";

const MAX_FILES = 20;
const MAX_FILE_SIZE = 5 * 1024 * 1024;
export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ message: "Sessão inválida. Entre novamente para importar." }, { status: 401 });
  try {
    const rawFiles = (await request.formData()).getAll("files");
    if (!rawFiles.length || rawFiles.length > MAX_FILES || rawFiles.some((value) => !(value instanceof File))) return NextResponse.json({ message: `Selecione de 1 a ${MAX_FILES} arquivos XLSX.` }, { status: 400 });
    const files: AdsFileInput[] = [];
    for (const value of rawFiles) {
      const file = value as File;
      if (!file.name.toLocaleLowerCase("pt-BR").endsWith(".xlsx") || file.size === 0 || file.size > MAX_FILE_SIZE) return NextResponse.json({ message: `O arquivo ${file.name} deve ser XLSX e ter até 5 MB.` }, { status: 400 });
      files.push({ fileName: file.name, buffer: Buffer.from(await file.arrayBuffer()) });
    }
    return NextResponse.json(await importAds({ files, userId: user.id, supabase }));
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Não foi possível importar publicidade." }, { status: 500 });
  }
}
