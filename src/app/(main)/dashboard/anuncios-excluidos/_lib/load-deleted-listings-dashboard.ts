import { createClient } from "@/lib/supabase/server";

export interface DeletedListingRow {
  id: string;
  mlb: string | null;
  title: string;
  sku: string | null;
  productName: string | null;
  deletedAt: string | null;
}

export async function loadDeletedListingsDashboard(): Promise<DeletedListingRow[]> {
  const supabase = await createClient();
  const { data: listings, error: listingsError } = await supabase
    .from("listings")
    .select("id, mlb, title, product_id")
    .eq("status", "Excluído");
  if (listingsError) throw new Error(`Não foi possível carregar os anúncios excluídos: ${listingsError.message}`);

  const listingIds = (listings ?? []).map((listing) => listing.id);
  const productIds = [...new Set((listings ?? []).map((listing) => listing.product_id).filter(Boolean))] as string[];
  const [eventsResult, productsResult] = await Promise.all([
    listingIds.length
      ? supabase
          .from("listing_status_events")
          .select("listing_id, occurred_at")
          .in("listing_id", listingIds)
          .order("occurred_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    productIds.length
      ? supabase.from("products").select("id, sku, name").in("id", productIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (eventsResult.error)
    throw new Error(`Não foi possível carregar a data de exclusão: ${eventsResult.error.message}`);
  if (productsResult.error) throw new Error(`Não foi possível carregar os produtos: ${productsResult.error.message}`);

  const deletedAtByListing = new Map<string, string>();
  for (const event of eventsResult.data ?? []) {
    if (!deletedAtByListing.has(event.listing_id)) deletedAtByListing.set(event.listing_id, event.occurred_at);
  }
  const products = new Map((productsResult.data ?? []).map((product) => [product.id, product]));

  return (listings ?? [])
    .map((listing) => {
      const product = listing.product_id ? products.get(listing.product_id) : null;
      return {
        id: listing.id,
        mlb: listing.mlb,
        title: listing.title,
        sku: product?.sku ?? null,
        productName: product?.name ?? null,
        deletedAt: deletedAtByListing.get(listing.id) ?? null,
      };
    })
    .sort((a, b) => (b.deletedAt ?? "").localeCompare(a.deletedAt ?? ""));
}
