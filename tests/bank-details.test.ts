import { describe, expect, it } from "vitest";
import {
  CHIPSTI_MAYBANK,
  formatBankAccountNumber,
  normalizeBankAccountNumber,
  receiptBankDetails,
} from "../src/lib/bank-details";
import { onlineSettingsSchema } from "../src/lib/shop-validation";
describe("CHIPSTI bank details", () => {
  it("repairs the duplicated number in legacy holder snapshots without mutating them", () => {
    const old = {
      bank_name: "MAYBANK",
      bank_account_name: "512222906185",
      bank_account_number: "5122 2290 6185",
    };
    expect(receiptBankDetails(old)).toEqual(CHIPSTI_MAYBANK);
    expect(old.bank_account_name).toBe("512222906185");
  });
  it("groups display digits and leaves the raw stored account unspaced", () => {
    expect(formatBankAccountNumber(CHIPSTI_MAYBANK.bank_account_number)).toBe(
      "5122 2290 6185",
    );
    expect(normalizeBankAccountNumber("5122 2290 6185")).toBe("512222906185");
    expect(CHIPSTI_MAYBANK.bank_account_number).toBe("512222906185");
  });
  it("normalizes spaces before settings are saved", () => {
    expect(
      onlineSettingsSchema.shape.bank_account_number.parse("5122 2290 6185"),
    ).toBe("512222906185");
  });
  it("does not replace a different account or business holder", () => {
    const other = {
      bank_name: "Other bank",
      bank_account_name: "Other holder",
      bank_account_number: "123456789012",
    };
    expect(receiptBankDetails(other)).toEqual(other);
  });
});
