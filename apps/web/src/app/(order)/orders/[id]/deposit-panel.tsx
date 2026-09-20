"use client";

import { useActionState, useState } from "react";
import {
  captureDepositAction,
  holdDepositAction,
  releaseDepositAction,
  setDepositAmountAction,
  type DepositState,
} from "./actions";

type Deposit = {
  amount: number;
  status: "PENDING" | "HELD" | "CAPTURED" | "RELEASED";
  method: string | null;
  capturedAmount: number | null;
  note: string | null;
};

const initial: DepositState = {};
const STATUS_LABEL: Record<Deposit["status"], string> = {
  PENDING: "Pending",
  HELD: "Held",
  CAPTURED: "Captured",
  RELEASED: "Released",
};
const STATUS_COLOR: Record<Deposit["status"], string> = {
  PENDING: "bg-neutral-400",
  HELD: "bg-amber-500",
  CAPTURED: "bg-red-500",
  RELEASED: "bg-green-500",
};

/** Security deposit block in the order's payment summary. */
export function DepositPanel({
  orderId,
  deposit,
  currency,
  closed,
  enabledMethods,
}: {
  orderId: string;
  deposit: Deposit | null;
  currency: string;
  closed: boolean;
  enabledMethods: { key: string; label: string }[];
}) {
  const [amountState, amountAction, amountPending] = useActionState(setDepositAmountAction.bind(null, orderId), initial);
  const [captureState, captureAction, capturePending] = useActionState(captureDepositAction.bind(null, orderId), initial);
  const [capturing, setCapturing] = useState(false);

  if (!deposit) {
    if (closed) return null;
    return (
      <div className="mt-3 border-t border-neutral-200 pt-3 text-xs">
        <p className="font-medium text-neutral-700">Security deposit</p>
        <p className="text-neutral-500">None required.</p>
        <form action={amountAction} className="mt-2 flex items-center gap-2">
          <input name="amount" type="number" min={0} step="0.01" placeholder="Amount" className="input w-24 py-1" />
          <button type="submit" disabled={amountPending} className="btn py-1 text-xs">
            Add deposit
          </button>
        </form>
        {amountState.error && <p className="mt-1 text-red-600">{amountState.error}</p>}
      </div>
    );
  }

  return (
    <div className="mt-3 border-t border-neutral-200 pt-3 text-xs">
      <div className="flex items-center justify-between">
        <p className="font-medium text-neutral-700">Security deposit</p>
        <span className="flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${STATUS_COLOR[deposit.status]}`} />
          {STATUS_LABEL[deposit.status]}
        </span>
      </div>
      <p className="mt-1 text-base font-semibold">
        {currency} {deposit.amount.toFixed(2)}
      </p>

      {deposit.status === "PENDING" && (
        <div className="mt-2 space-y-2">
          <form action={amountAction} className="flex items-center gap-2">
            <input name="amount" type="number" min={0} step="0.01" defaultValue={deposit.amount} className="input w-24 py-1" />
            <button type="submit" disabled={amountPending} className="btn py-1 text-xs">
              Change
            </button>
          </form>
          {amountState.error && <p className="text-red-600">{amountState.error}</p>}
          <form action={holdDepositAction.bind(null, orderId)} className="flex items-center gap-2">
            <select name="method" className="input w-36 py-1 text-xs" defaultValue="">
              <option value="">Taken via...</option>
              {enabledMethods.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
            <button type="submit" className="btn-primary py-1 text-xs">
              Mark as held
            </button>
          </form>
        </div>
      )}

      {deposit.status === "HELD" && (
        <div className="mt-2 space-y-2">
          <div className="flex gap-2">
            <form action={releaseDepositAction.bind(null, orderId)}>
              <button type="submit" className="btn py-1 text-xs">
                Release
              </button>
            </form>
            <button type="button" onClick={() => setCapturing((c) => !c)} className="btn py-1 text-xs">
              Keep some or all
            </button>
          </div>
          {capturing && (
            <form action={captureAction} className="space-y-2 rounded-lg bg-neutral-50 p-2">
              <input
                name="amount"
                type="number"
                min={0.01}
                max={deposit.amount}
                step="0.01"
                defaultValue={deposit.amount}
                className="input py-1"
                aria-label="Amount to keep"
              />
              <input name="note" placeholder="Reason (required)" className="input py-1" />
              {captureState.error && <p className="text-red-600">{captureState.error}</p>}
              <button type="submit" disabled={capturePending} className="rounded bg-red-600 px-3 py-1 font-medium text-white">
                Keep deposit
              </button>
            </form>
          )}
        </div>
      )}

      {deposit.status === "CAPTURED" && (
        <p className="mt-1 text-neutral-600">
          Kept {currency} {(deposit.capturedAmount ?? 0).toFixed(2)}
          {deposit.note ? `: ${deposit.note}` : ""}
        </p>
      )}
      {deposit.status === "HELD" && !closed && null}
    </div>
  );
}
