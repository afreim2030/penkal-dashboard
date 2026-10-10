"use client";

import { Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

import { setPausedListingTag, updatePausedListingSku } from "../_actions/paused-listing-actions";

export function PausedListingActions({
  listingId,
  productId,
  sku,
  tag,
}: {
  listingId: string;
  productId: string | null;
  sku: string | null;
  tag: "ok" | "sem_estoque" | null;
}) {
  const [pending, startTransition] = useTransition();
  const [editOpen, setEditOpen] = useState(false);
  const [nextSku, setNextSku] = useState(sku ?? "");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const setTag = (nextTag: "ok" | "sem_estoque") => startTransition(async () => {
    await setPausedListingTag(listingId, nextTag);
    router.refresh();
  });

  const saveSku = () => {
    if (!productId) return;
    startTransition(async () => {
      try {
        setError(null);
        const result = await updatePausedListingSku(productId, sku, nextSku);
        if (result.error) { setError(result.error); return; }
        setEditOpen(false);
        router.refresh();
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Não foi possível atualizar o SKU.");
      }
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant={tag === "ok" ? "default" : "outline"} onClick={() => setTag("ok")} disabled={pending}>OK</Button>
      <Button size="sm" variant={tag === "sem_estoque" ? "destructive" : "outline"} onClick={() => setTag("sem_estoque")} disabled={pending}>Sem estoque</Button>
      {tag === "ok" ? <Badge>OK</Badge> : null}
      {tag === "sem_estoque" ? <Badge variant="destructive">Sem estoque</Badge> : null}
      <Button size="icon" variant="ghost" aria-label="Editar SKU" onClick={() => { setNextSku(sku ?? ""); setError(null); setEditOpen(true); }} disabled={!productId || pending}>
        <Pencil className="size-4" />
      </Button>
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar SKU</DialogTitle>
            <DialogDescription>Atualize o SKU deste produto.</DialogDescription>
          </DialogHeader>
          <Input value={nextSku} onChange={(event) => setNextSku(event.target.value)} disabled={pending} autoFocus />
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={pending}>Cancelar</Button>
            <Button onClick={saveSku} disabled={pending || !nextSku.trim()}>{pending ? "Salvando..." : "Salvar SKU"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
