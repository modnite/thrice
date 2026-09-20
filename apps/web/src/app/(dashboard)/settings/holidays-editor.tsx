"use client";

import { useMemo, useState } from "react";
import type { HolidaysConfig } from "@thrice/shared/store-hours";

type Mode = HolidaysConfig["hours"]["mode"];

const MODES: { value: Mode; label: string }[] = [
  { value: "sunday", label: "Same as Sunday" },
  { value: "saturday", label: "Same as Saturday" },
  { value: "custom", label: "Their own hours" },
  { value: "closed", label: "Closed" },
];

const weekdayOf = (ymd: string) => {
  const d = new Date(`${ymd}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" });
};

/**
 * Days that run on different hours from the normal week. Sent with the settings form as one JSON field.
 * Empty list = no holidays, and nothing is saved.
 */
export function HolidaysEditor({ initial }: { initial: HolidaysConfig | null }) {
  const [mode, setMode] = useState<Mode>(initial?.hours.mode ?? "sunday");
  const [open, setOpen] = useState(initial?.hours.open ?? "08:00");
  const [close, setClose] = useState(initial?.hours.close ?? "13:00");
  const [dates, setDates] = useState(initial?.dates ?? []);
  const [newDate, setNewDate] = useState("");
  const [newName, setNewName] = useState("");

  const sorted = useMemo(() => [...dates].sort((a, b) => a.date.localeCompare(b.date)), [dates]);
  const value = JSON.stringify(
    sorted.length === 0 ? null : { hours: mode === "custom" ? { mode, open, close } : { mode }, dates: sorted }
  );

  function add() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate) || dates.some((d) => d.date === newDate)) return;
    setDates((prev) => [...prev, { date: newDate, name: newName.trim() || undefined }]);
    setNewDate("");
    setNewName("");
  }

  return (
    <div className="space-y-3 border-t border-neutral-100 pt-4">
      <input type="hidden" name="holidays" value={value} />
      <h3 className="text-sm font-medium">Holidays</h3>
      <p className="text-xs text-neutral-500">
        Dates that run on different hours from the normal week. On those dates the hours below replace the day&apos;s usual hours. Nothing is closed unless you choose Closed.
      </p>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span>On these dates we are open:</span>
        <select value={mode} onChange={(e) => setMode(e.target.value as Mode)} className="input w-44">
          {MODES.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
        {mode === "custom" && (
          <>
            <input type="time" value={open} onChange={(e) => setOpen(e.target.value)} className="input w-28" />
            <span>-</span>
            <input type="time" value={close} onChange={(e) => setClose(e.target.value)} className="input w-28" />
          </>
        )}
      </div>

      <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200 text-sm">
        {sorted.map((d) => (
          <li key={d.date} className="flex items-center justify-between gap-3 px-3 py-2">
            <span>
              <span className="font-medium">{d.date}</span> <span className="text-neutral-400">{weekdayOf(d.date)}</span>
              {d.name && <span className="ml-2 text-neutral-600">{d.name}</span>}
            </span>
            <button type="button" onClick={() => setDates((prev) => prev.filter((x) => x.date !== d.date))} className="text-xs text-red-700 underline">
              Remove
            </button>
          </li>
        ))}
        {sorted.length === 0 && <li className="px-3 py-3 text-neutral-400">No holidays added.</li>}
      </ul>

      <div className="flex flex-wrap items-center gap-2">
        <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="input w-40" />
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="Name (optional)"
          maxLength={60}
          className="input min-w-0 flex-1"
        />
        <button type="button" onClick={add} disabled={!newDate} className="btn">
          Add date
        </button>
      </div>
    </div>
  );
}
