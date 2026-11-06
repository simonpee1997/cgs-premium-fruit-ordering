import { describe, expect, it } from "vitest";
import { orderItemEnglishName } from "../src/lib/order-item-name";

describe("English names on saved orders", () => {
  it("translates approved legacy snapshots without changing saved item names", () => {
    const item = { sku: "L-121", name: "墨西哥风味巧克力蛋饼" };
    expect(orderItemEnglishName(item)).toBe("Mexico Chocolate Cream Kapet");
    expect(item.name).toBe("墨西哥风味巧克力蛋饼");
  });
  it("uses the saved English name when available", () => {
    expect(
      orderItemEnglishName({
        sku: "L-121",
        name: "旧名称",
        english_name: "Saved product name",
      }),
    ).toBe("Saved product name");
  });
  it("does not apply legacy translations to a renamed or unknown product", () => {
    expect(orderItemEnglishName({ sku: "L-121", name: "不同商品" })).toBeNull();
    expect(orderItemEnglishName({ sku: "NEW", name: "新品" })).toBeNull();
  });
});
