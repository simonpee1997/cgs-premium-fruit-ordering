// Remove only the retired schedule copy; saved settings and delivery rules stay intact.
export function customerDeliveryNote(note: string | null | undefined) {
  return (note ?? "")
    .replace(
      /\bKlang\s+Valley\s+Mon(?:day)?\s+to\s+Saturday\s*\.?\s*Next\s+day\s+delivery\b\.?/gi,
      "",
    )
    .trim();
}
