/** Short symbols for currencies people usually write with one. Anything else is shown as its code. */
const SYMBOLS: Record<string, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  CAD: "CA$",
  AUD: "A$",
  NZD: "NZ$",
  INR: "₹",
  ZAR: "R",
  TTD: "TT$",
  JMD: "J$",
  BBD: "Bds$",
  GYD: "G$",
  XCD: "EC$",
};

/** "TT$", "$", "€"... or the code with a trailing space ("CHF ") when there is no short symbol. */
export function currencySymbol(code: string | null | undefined): string {
  const c = (code ?? "USD").toUpperCase();
  return SYMBOLS[c] ?? `${c} `;
}

/** A price as shown in the app: symbol then two decimals, no thousands separator. */
export function formatMoney(amount: number | string, currency: string | null | undefined = "USD"): string {
  const n = typeof amount === "string" ? Number(amount) : amount;
  return `${currencySymbol(currency)}${n.toFixed(2)}`;
}
