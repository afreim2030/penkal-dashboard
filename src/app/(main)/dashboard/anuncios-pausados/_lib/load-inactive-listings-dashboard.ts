import { createClient } from "@/lib/supabase/server";

export interface InactiveListingRow {
  id: string;
  mlb: string | null;
  title: string;
  status: string;
  sku: string | null;
  productName: string | null;
  pausedAt: string | null;
  source: string | null;
}

export async function loadInactiveListingsDashboard(): Promise<InactiveListingRow[]> {
  const supabase = await createClient();
  const { data: listings, error: listingsError } = await supabase
    .from("listings")
    .select("id, mlb, title, status, product_id")
    .in("status", ["Inativo", "Pausado"]);

  if (listingsError) throw new Error(`Não foi possível carregar os anúncios: ${listingsError.message}`);
  const listingIds = (listings ?? []).map((listing) => listing.id);
  const productIds = [...new Set((listings ?? []).map((listing) => listing.product_id).filter(Boolean))] as string[];

  const [eventsResult, productsResult] = await Promise.all([
    listingIds.length
      ? supabase.from("listing_status_events").select("listing_id, occurred_at, source").in("listing_id", listingIds).order("occurred_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    productIds.length
      ? supabase.from("products").select("id, sku, name").in("id", productIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (eventsResult.error) throw new Error(`Não foi possível carregar as datas de status: ${eventsResult.error.message}`);
  if (productsResult.error) throw new Error(`Não foi possível carregar os produtos: ${productsResult.error.message}`);

  const latestEvent = new Map<string, { occurred_at: string; source: string }>();
  for (const event of eventsResult.data ?? []) {
    if (!latestEvent.has(event.listing_id)) latestEvent.set(event.listing_id, event);
  }
  const products = new Map((productsResult.data ?? []).map((product) => [product.id, product]));

  return (listings ?? [])
    .map((listing) => {
      const product = listing.product_id ? products.get(listing.product_id) : null;
      const event = latestEvent.get(listing.id);
      return {
        id: listing.id,
        mlb: listing.mlb,
        title: listing.title,
        status: listing.status,
        sku: product?.sku ?? null,
        productName: product?.name ?? null,
        pausedAt: event?.occurred_at ?? null,
        source: event?.source ?? null,
      };
    })
    .sort((a, b) => (b.pausedAt ?? "").localeCompare(a.pausedAt ?? ""));
}
