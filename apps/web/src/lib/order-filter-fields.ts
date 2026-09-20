// Client-safe description of the advanced ("Filters") builder on the Completed table.
// Each filter travels in the URL as `f=<field>~<op>~<value>`, repeated for every row.

export type FilterKind = "text" | "enum" | "number" | "date";

export type FilterField = {
  key: string;
  label: string;
  kind: FilterKind;
  options?: [string, string][];
};

export const FILTER_FIELDS: FilterField[] = [
  { key: "customer", label: "Customer", kind: "text" },
  { key: "product", label: "Product", kind: "text" },
  {
    key: "payment",
    label: "Payment",
    kind: "enum",
    options: [
      ["paid", "Paid"],
      ["unpaid", "Unpaid"],
    ],
  },
  {
    key: "status",
    label: "Status",
    kind: "enum",
    options: [
      ["completed", "Completed"],
      ["cancelled", "Cancelled"],
    ],
  },
  {
    key: "type",
    label: "Type",
    kind: "enum",
    options: [
      ["BOOKING", "Booking"],
      ["SALE", "Sale"],
      ["SUBSCRIPTION", "Subscription"],
      ["BUYBACK", "Buyback"],
    ],
  },
  { key: "price", label: "Price", kind: "number" },
  { key: "created", label: "Created", kind: "date" },
  { key: "start", label: "Start", kind: "date" },
  { key: "end", label: "End", kind: "date" },
];

export const FILTER_OPS: Record<FilterKind, [string, string][]> = {
  text: [["contains", "contains"]],
  enum: [["is", "is"]],
  number: [
    ["gt", ">"],
    ["lt", "<"],
    ["eq", "="],
  ],
  date: [
    ["before", "before"],
    ["after", "after"],
  ],
};

export function describeFilter(f: string): string {
  const [field, op, ...rest] = f.split("~");
  const def = FILTER_FIELDS.find((x) => x.key === field);
  const opLabel = def ? (FILTER_OPS[def.kind].find(([k]) => k === op)?.[1] ?? op) : op;
  const raw = rest.join("~");
  const valueLabel = def?.options?.find(([k]) => k === raw)?.[1] ?? raw;
  return `${def?.label ?? field} ${opLabel} ${valueLabel}`;
}
