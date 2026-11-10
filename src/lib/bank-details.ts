export type BankDetails = {
  bank_name: string;
  bank_account_name: string;
  bank_account_number: string;
};
export const CHIPSTI_MAYBANK: Readonly<BankDetails> = {
  bank_name: "Maybank",
  bank_account_name: "CHIPSTI ENTERPRISE",
  bank_account_number: "512222906185",
};
export function normalizeBankAccountNumber(value: string) {
  return value.replace(/\s+/g, "");
}
export function formatBankAccountNumber(value: string) {
  const raw = normalizeBankAccountNumber(value);
  return /^\d+$/.test(raw) ? raw.match(/.{1,4}/g)!.join(" ") : value;
}
export function receiptBankDetails(bank: BankDetails): BankDetails {
  const raw = normalizeBankAccountNumber(bank.bank_account_number);
  // Correct the known mistyped holder in legacy order snapshots without rewriting
  // historical orders or substituting another branch/account's payment details.
  return raw === CHIPSTI_MAYBANK.bank_account_number
    ? { ...CHIPSTI_MAYBANK }
    : { ...bank, bank_account_number: raw };
}
