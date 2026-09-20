import { z } from "zod";

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM");

export const dayHoursSchema = z
  .object({ open: timeSchema, close: timeSchema })
  .refine((d) => d.close > d.open, { message: "Closing time must be after opening time" })
  .nullable();

/** Keys "0".."6" (0 = Sunday). A null day means closed. */
export const openingHoursSchema = z.record(z.string().regex(/^[0-6]$/), dayHoursSchema);

export type OpeningHours = z.infer<typeof openingHoursSchema>;

/**
 * Days that run on different hours from the normal week (public holidays, for example). `hours` says which:
 * the same as a Sunday or a Saturday, a set of custom times, or closed. Dates are "YYYY-MM-DD" in the store timezone.
 */
export const holidaysSchema = z
  .object({
    hours: z.object({
      mode: z.enum(["sunday", "saturday", "custom", "closed"]),
      open: timeSchema.optional(),
      close: timeSchema.optional(),
    }),
    dates: z
      .array(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date"), name: z.string().trim().max(60).optional() }))
      .max(400),
  })
  .superRefine((v, ctx) => {
    if (v.hours.mode !== "custom") return;
    if (!v.hours.open || !v.hours.close) ctx.addIssue({ code: "custom", message: "Enter the holiday opening and closing times", path: ["hours"] });
    else if (v.hours.close <= v.hours.open) ctx.addIssue({ code: "custom", message: "Holiday closing time must be after opening time", path: ["hours"] });
  });

export type HolidaysConfig = z.infer<typeof holidaysSchema>;

export const WEEKDAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Weekday (0-6), "YYYY-MM-DD" and "HH:MM" of an instant as seen in the given IANA timezone. */
export function localParts(date: Date, timeZone: string): { weekday: number; time: string; date: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return {
    weekday: WEEKDAY_INDEX[get("weekday")] ?? 0,
    time: `${get("hour")}:${get("minute")}`,
    date: `${get("year")}-${get("month")}-${get("day")}`,
  };
}

/** The open window on a given local date: a holiday's hours if it is one, otherwise the weekday's. Null = closed. */
export function hoursOn(
  hours: OpeningHours,
  weekday: number,
  ymd: string,
  holidays?: HolidaysConfig | null
): { open: string; close: string } | null {
  if (holidays?.dates.some((d) => d.date === ymd)) {
    const h = holidays.hours;
    if (h.mode === "closed") return null;
    if (h.mode === "custom") return h.open && h.close ? { open: h.open, close: h.close } : null;
    return hours[h.mode === "sunday" ? "0" : "6"] ?? null;
  }
  return hours[String(weekday)] ?? null;
}

/** True when no hours are configured, or the instant falls inside that day's open window. */
export function isWithinOpeningHours(
  hours: OpeningHours | null | undefined,
  date: Date,
  timeZone: string,
  holidays?: HolidaysConfig | null
): boolean {
  if (!hours || Object.keys(hours).length === 0) return true;
  const { weekday, time, date: ymd } = localParts(date, timeZone);
  const day = hoursOn(hours, weekday, ymd, holidays);
  if (!day) return false;
  return time >= day.open && time <= day.close;
}

/** Fixed duration presets offered on Create Order (minutes). */
export const DURATION_PRESETS: { label: string; minutes: number }[] = [
  { label: "1 hour", minutes: 60 },
  { label: "2 hours", minutes: 120 },
  { label: "4 hours", minutes: 240 },
  { label: "1 day", minutes: 1440 },
  { label: "2 days", minutes: 2880 },
  { label: "3 days", minutes: 4320 },
  { label: "1 week", minutes: 10080 },
];
