// Approved translations for legacy order snapshots, which predate English names.
// Match both SKU and saved name so renamed/reused products are never mislabeled.
const legacyNames: Record<string, readonly [string, string]> = {
  "LF-02": ["原味黄金呀菇", "Original Golden Arrowhead"],
  "LF-05": ["咸蛋呀菇", "Salted Egg Arrowhead"],
  "LF-08": ["金香咸蛋鱼皮", "Kam Heong Salted Egg Fish Skin"],
  "LF-11": ["咸蛋黑松露鱼皮", "Salted Egg Truffle Fish Skin"],
  "LF-21": ["咸蛋蟹柳片", "Salted Egg Dodo Crab Sticks"],
  "LB-91": ["黄金凤梨球", "Farmcow Pineapple Balls"],
  "L-121": ["墨西哥风味巧克力蛋饼", "Mexico Chocolate Cream Kapet"],
  "L-146": [
    "金桶古早味海苔鸡丝荷包饼",
    "Gold Tin Traditional Seaweed Chicken Floss Wallet Puffs",
  ],
  "LCP-25": ["比利时海盐黑巧克力", "Pure Belgian Sea Salt Chocolate"],
  "L-28": ["黑芝麻方罐蜜蜂窝", "Black Sesame Honeycomb"],
  "L-36": ["金香鸡丝蛋卷", "Kam Heong Chicken Floss Egg Rolls"],
};

export function orderItemEnglishName(item: {
  sku: string;
  name: string;
  english_name?: string | null;
}): string | null {
  const saved = item.english_name?.trim();
  if (saved) return saved;
  const approved = legacyNames[item.sku];
  return approved?.[0] === item.name ? approved[1] : null;
}
