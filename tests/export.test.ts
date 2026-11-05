import { it, expect } from "vitest";
import writeExcelFile from "write-excel-file/node";
import { unzipSync, strFromU8 } from "fflate";
it("writes Chinese text and monetary integers as spreadsheet cells, never formulas", async () => {
  const result = await writeExcelFile([
    {
      sheet: "Sales",
      data: [
        ["SKU", "Product", "Amount sen"],
        ["LF-02", "原味黄金呀菇", 1800],
        ["=UNTRUSTED", "Test", 0],
      ],
    },
    { sheet: "Refunds", data: [["Refund sen"], [1800]] },
  ]).toBuffer();
  const files = unzipSync(new Uint8Array(result));
  const xml = Object.entries(files)
    .filter(([name]) => name.endsWith(".xml"))
    .map(([, value]) => strFromU8(value))
    .join("");
  expect(xml).toContain("原味黄金呀菇");
  expect(xml).toContain("1800");
  expect(xml).toContain("=UNTRUSTED");
  expect(xml).not.toContain("<f>");
  expect(xml).toContain("Refunds");
});
