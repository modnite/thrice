import { z } from "zod";

// Payment options are a list each store manages itself (Settings > Payment methods): add your own
// (a processor, Linx, cheque...), rename, hide or show, reorder, remove. An order stores the NAME of
// the option that was used, so renaming or removing an option later never rewrites history.

export type PaymentMethodOption = { id: string; label: string; description: string; enabled: boolean };

export const MAX_PAYMENT_METHODS = 20;

export const DEFAULT_PAYMENT_METHODS: PaymentMethodOption[] = [
  { id: "card", label: "Debit/Credit Card", description: "This option is available at our rental house.", enabled: true },
  { id: "cash", label: "Cash", description: "This option is available at our rental house.", enabled: true },
  { id: "transfer", label: "Online Transfer", description: "Payment is made by bank transfer before pickup.", enabled: true },
];

const optionSchema = z.object({
  id: z.string().trim().min(1).max(60),
  label: z.string().trim().min(1, "Every payment option needs a name.").max(40, "Keep option names under 40 characters."),
  description: z.string().max(2000),
  enabled: z.boolean(),
});

/** What the settings form sends: validated, with unique names and ids. */
export const paymentMethodsInputSchema = z
  .array(optionSchema)
  .max(MAX_PAYMENT_METHODS, `Use at most ${MAX_PAYMENT_METHODS} payment options.`)
  .superRefine((list, ctx) => {
    const labels = new Set<string>();
    const ids = new Set<string>();
    for (const [i, m] of list.entries()) {
      const key = m.label.toLowerCase();
      if (labels.has(key)) ctx.addIssue({ code: "custom", message: `"${m.label}" appears twice.`, path: [i, "label"] });
      if (ids.has(m.id)) ctx.addIssue({ code: "custom", message: "Duplicate option.", path: [i, "id"] });
      labels.add(key);
      ids.add(m.id);
    }
  });

// The three built-ins were once stored as { CARD: {...}, CASH: {...}, TRANSFER: {...} }.
const LEGACY_KEYS: [string, string][] = [
  ["CARD", "card"],
  ["CASH", "cash"],
  ["TRANSFER", "transfer"],
];

/**
 * The store's payment options as saved, or the defaults when it has never customised them. Reads the
 * older fixed-key format too, and skips any single malformed entry instead of discarding the list.
 * An empty saved list is respected: a store may deliberately offer none.
 */
export function resolvePaymentMethods(stored: unknown): PaymentMethodOption[] {
  if (Array.isArray(stored)) {
    return stored.flatMap((item) => {
      const parsed = optionSchema.safeParse(item);
      return parsed.success ? [parsed.data] : [];
    });
  }
  if (stored && typeof stored === "object") {
    const legacy = stored as Record<string, unknown>;
    return LEGACY_KEYS.map(([oldKey, id]) => {
      const fallback = DEFAULT_PAYMENT_METHODS.find((m) => m.id === id) as PaymentMethodOption;
      const entry = z.object({ enabled: z.boolean(), description: z.string().max(2000) }).safeParse(legacy[oldKey]);
      return entry.success ? { ...fallback, ...entry.data } : fallback;
    });
  }
  return DEFAULT_PAYMENT_METHODS;
}

/** The names offered when recording a payment, in the order the store set. */
export function enabledPaymentLabels(methods: PaymentMethodOption[]): string[] {
  return methods.filter((m) => m.enabled).map((m) => m.label);
}
