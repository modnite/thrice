import {
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfQuarter,
  endOfQuarter,
  startOfYear,
  endOfYear,
  addDays,
  subDays,
  addWeeks,
  subWeeks,
  addMonths,
  subMonths,
  addQuarters,
  subQuarters,
  addYears,
  subYears,
} from "date-fns";

export type DateRange = { from: Date; to: Date };

export const DATE_PRESET_KEYS = [
  "today",
  "tomorrow",
  "yesterday",
  "thisWeek",
  "lastWeek",
  "last7Days",
  "thisMonth",
  "lastMonth",
  "nextMonth",
  "thisQuarter",
  "lastQuarter",
  "nextQuarter",
  "thisYear",
  "lastYear",
] as const;

export type DatePresetKey = (typeof DATE_PRESET_KEYS)[number];

export const DATE_PRESET_LABELS: Record<DatePresetKey, string> = {
  today: "Today",
  tomorrow: "Tomorrow",
  yesterday: "Yesterday",
  thisWeek: "This Week",
  lastWeek: "Last Week",
  last7Days: "Last 7 Days",
  thisMonth: "This Month",
  lastMonth: "Last Month",
  nextMonth: "Next Month",
  thisQuarter: "This Quarter",
  lastQuarter: "Last Quarter",
  nextQuarter: "Next Quarter",
  thisYear: "This Year",
  lastYear: "Last Year",
};

export function resolveDatePreset(key: DatePresetKey, now: Date = new Date()): DateRange {
  switch (key) {
    case "today":
      return { from: startOfDay(now), to: endOfDay(now) };
    case "tomorrow": {
      const d = addDays(now, 1);
      return { from: startOfDay(d), to: endOfDay(d) };
    }
    case "yesterday": {
      const d = subDays(now, 1);
      return { from: startOfDay(d), to: endOfDay(d) };
    }
    case "thisWeek":
      return { from: startOfWeek(now), to: endOfWeek(now) };
    case "lastWeek": {
      const d = subWeeks(now, 1);
      return { from: startOfWeek(d), to: endOfWeek(d) };
    }
    case "last7Days":
      return { from: startOfDay(subDays(now, 6)), to: endOfDay(now) };
    case "thisMonth":
      return { from: startOfMonth(now), to: endOfMonth(now) };
    case "lastMonth": {
      const d = subMonths(now, 1);
      return { from: startOfMonth(d), to: endOfMonth(d) };
    }
    case "nextMonth": {
      const d = addMonths(now, 1);
      return { from: startOfMonth(d), to: endOfMonth(d) };
    }
    case "thisQuarter":
      return { from: startOfQuarter(now), to: endOfQuarter(now) };
    case "lastQuarter": {
      const d = subQuarters(now, 1);
      return { from: startOfQuarter(d), to: endOfQuarter(d) };
    }
    case "nextQuarter": {
      const d = addQuarters(now, 1);
      return { from: startOfQuarter(d), to: endOfQuarter(d) };
    }
    case "thisYear":
      return { from: startOfYear(now), to: endOfYear(now) };
    case "lastYear": {
      const d = subYears(now, 1);
      return { from: startOfYear(d), to: endOfYear(d) };
    }
  }
}
