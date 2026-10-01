"use client";

import { MoreHorizontal, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { excludeProduct } from "../_actions/exclude-product";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export function ProductRowActions({ sku, name }: { sku: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const confirm = () => startTransition(async () => { await excludeProduct(sku); setOpen(false); router.refresh(); });
  return <>
    <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={"Opções do SKU " + sku}><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem variant="destructive" onSelect={() => setOpen(true)}><Trash2 />Excluir anúncio</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
    <AlertDialog open={open} onOpenChange={setOpen}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Excluir anúncio da lista?</AlertDialogTitle><AlertDialogDescription>O SKU {sku} — {name} deixará de aparecer em Produtos. O histórico de vendas não será apagado.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel><AlertDialogAction disabled={pending} onClick={confirm}>{pending ? "Excluindo..." : "Excluir anúncio"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </>;
}
