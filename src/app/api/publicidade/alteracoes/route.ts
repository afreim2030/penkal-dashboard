import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const CHANGE_TYPES = new Set(["Orçamento", "ACOS alvo", "Produtos", "Campanha", "Outro"]);

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  try {
    const body = await request.json() as { campaignName?: unknown; changeType?: unknown; status?: unknown; notes?: unknown };
    const campaignName = typeof body.campaignName === "string" ? body.campaignName.trim() : "";
    const changeType = typeof body.changeType === "string" ? body.changeType.trim() : "";
    const status = typeof body.status === "string" ? body.status.trim().slice(0, 80) : "";
    const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 1000) : "";
    if (!campaignName || !CHANGE_TYPES.has(changeType)) return NextResponse.json({ error: "Selecione a campanha e o tipo de alteração." }, { status: 400 });
    const { data, error } = await supabase.rpc("record_campaign_change", { p_campaign_name: campaignName, p_change_type: changeType, p_campaign_status: status || null, p_notes: notes || null });
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true, id: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível registrar a alteração." }, { status: 500 });
  }
}
