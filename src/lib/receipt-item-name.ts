// Prefer the frozen database snapshot; resolve historical receipts only against
// the same product and saved name. Never invent translations for renamed items.
export function receiptEnglishName(
  item: {
    product_id?: string | null;
    name: string;
    english_name?: string | null;
  },
  products: { id: string; name: string; english_name?: string | null }[],
): string | null {
  const saved = item.english_name?.trim();
  if (saved) return saved;
  const product = products.find(
    (p) => p.id === item.product_id && p.name === item.name,
  );
  return product?.english_name?.trim() || null;
}
