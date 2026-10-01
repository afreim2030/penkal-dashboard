import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
export async function GET(){const supabase=await createClient();const {data,error}=await supabase.rpc("get_full_replenishment_data");if(error)return NextResponse.json({message:error.message},{status:500});return NextResponse.json(data);}
