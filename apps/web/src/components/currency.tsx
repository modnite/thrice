"use client";

import { createContext, useContext, type ReactNode } from "react";
import { currencySymbol } from "@thrice/shared/currency";

const CurrencyContext = createContext<string>("USD");

/** Makes the store's currency available to client components, so no screen hard-codes a symbol. */
export function CurrencyProvider({ code, children }: { code: string; children: ReactNode }) {
  return <CurrencyContext.Provider value={code}>{children}</CurrencyContext.Provider>;
}

export const useCurrencyCode = () => useContext(CurrencyContext);
/** "TT$", "$", "€"... for the current store. */
export const useCurrencySymbol = () => currencySymbol(useContext(CurrencyContext));
