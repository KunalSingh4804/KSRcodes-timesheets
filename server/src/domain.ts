import { z } from "zod";
export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(v + "T00:00:00Z");
    return Number.isFinite(+d) && d.toISOString().slice(0, 10) === v;
  }, "Invalid calendar date");
export const entrySchema = z
  .object({
    projectId: z.uuid(),
    workDate: dateSchema,
    description: z.string().trim().min(3).max(2000),
    taskId: z.string().trim().max(100).optional(),
    minutes: z.number().int().min(1).max(1440),
    category: z.string().min(1).max(50),
    billable: z.boolean(),
    remarks: z.string().max(2000).optional(),
  })
  .strict();
export const entriesSchema = z.array(entrySchema).max(2000);
export type EntryInput = z.infer<typeof entrySchema>;
export const policySchema = z
  .object({
    workingDays: z.array(z.number().int().min(0).max(6)).min(1),
    targetMinutes: z.number().int().min(0).max(1440),
    maxDailyMinutes: z.number().int().min(1).max(1440).nullable(),
    categories: z.array(z.string().min(1).max(50)).min(1),
    allowLate: z.boolean(),
    allowFuture: z.boolean(),
  })
  .strict();
export type Policy = z.infer<typeof policySchema>;
export const dateOnly = (d: Date) => d.toISOString().slice(0, 10);
export const todayIn = (timezone: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export function assertPeriod(start: Date, end: Date) {
  if (
    start.getUTCDate() !== 1 ||
    end.getUTCFullYear() !== start.getUTCFullYear() ||
    end.getUTCMonth() !== start.getUTCMonth() ||
    end.getUTCDate() !==
      new Date(
        Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0),
      ).getUTCDate()
  )
    throw new AppError(422, "Period must be one complete calendar month");
}
export function validateEntries(
  entries: EntryInput[],
  start: Date,
  end: Date,
  policy: Policy,
  timezone: string,
) {
  const totals = new Map<string, number>();
  for (const e of entries) {
    if (e.workDate < dateOnly(start) || e.workDate > dateOnly(end))
      throw new AppError(422, "Work date is outside this reporting period");
    if (!policy.categories.includes(e.category))
      throw new AppError(
        422,
        "Work category is not permitted by this period policy",
      );
    if (!policy.allowFuture && e.workDate > todayIn(timezone))
      throw new AppError(422, "Future entries are disabled by policy");
    totals.set(e.workDate, (totals.get(e.workDate) ?? 0) + e.minutes);
  }
  for (const total of totals.values())
    if (
      total > 1440 ||
      (policy.maxDailyMinutes !== null && total > policy.maxDailyMinutes)
    )
      throw new AppError(422, "Daily duration exceeds the configured limit");
}
export function expectedMinutes(
  start: Date,
  end: Date,
  policy: Policy,
  holidays: string[],
) {
  let n = 0;
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    if (
      policy.workingDays.includes(d.getUTCDay()) &&
      !holidays.includes(dateOnly(d))
    )
      n += policy.targetMinutes;
  }
  return n;
}
export function csvCell(value: unknown) {
  let s = String(value ?? "");
  if (/^[\s\u0000-\u001f]*[=+@-]/.test(s)) s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
}
