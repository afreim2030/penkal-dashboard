"use client";

import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";

import { excludeProduct } from "../_actions/exclude-product";
import { updateProductSku } from "../_actions/update-product-sku";

export function ProductRowActions({ sku, name }: { sku: string; name: string }) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [nextSku, setNextSku] = useState(sku);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const confirmDelete = () => startTransition(async () => {
    await excludeProduct(sku);
    setDeleteOpen(false);
    router.refresh();
  });

  const saveSku = () => startTransition(async () => {
    try {
      setError(null);
      await updateProductSku(sku, nextSku);
      setEditOpen(false);
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível atualizar o SKU.");
    }
  });

  return <>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={"Opções do SKU " + sku}><MoreHorizontal className="size-4" /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={(event) => { event.preventDefault(); setNextSku(sku); setError(null); setEditOpen(true); }}>
          <Pencil />Editar SKU
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onSelect={() => setDeleteOpen(true)}>
          <Trash2 />Excluir anúncio
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>

    <Dialog open={editOpen} onOpenChange={setEditOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar SKU</DialogTitle>
          <DialogDescription>{name}</DialogDescription>
        </DialogHeader>
        <Input value={nextSku} onChange={(event) => setNextSku(event.target.value)} disabled={pending} autoFocus />
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => setEditOpen(false)} disabled={pending}>Cancelar</Button>
          <Button onClick={saveSku} disabled={pending || !nextSku.trim()}>{pending ? "Salvando..." : "Salvar SKU"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir anúncio da lista?</AlertDialogTitle>
          <AlertDialogDescription>O SKU {sku} — {name} deixará de aparecer em Produtos. O histórico de vendas não será apagado.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction disabled={pending} onClick={confirmDelete}>{pending ? "Excluindo..." : "Excluir anúncio"}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>;
}
