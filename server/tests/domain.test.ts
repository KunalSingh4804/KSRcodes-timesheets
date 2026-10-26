import { describe, it, expect } from "vitest";
import {
  dateSchema,
  entrySchema,
  assertPeriod,
  validateEntries,
  expectedMinutes,
  csvCell,
  type Policy,
} from "../src/domain.js";
const policy: Policy = {
  workingDays: [1, 2, 3, 4, 5],
  targetMinutes: 450,
  maxDailyMinutes: null,
  categories: ["Development"],
  allowLate: true,
  allowFuture: true,
};
const entry = {
  projectId: "8e60d7cf-630b-45d2-a53b-aa37820f5a34",
  workDate: "2026-02-02",
  description: "Build integration",
  minutes: 60,
  category: "Development",
  billable: true,
};
describe("calendar and duration rules", () => {
  it.each(["2026-02-30", "2026-13-01", "2026-2-01", "not-a-date"])(
    "rejects invalid date %s",
    (d) => expect(dateSchema.safeParse(d).success).toBe(false),
  );
  it("allows leap day only in a leap year", () => {
    expect(dateSchema.safeParse("2028-02-29").success).toBe(true);
    expect(dateSchema.safeParse("2026-02-29").success).toBe(false);
  });
  it("requires integer minutes", () =>
    expect(entrySchema.safeParse({ ...entry, minutes: 10.5 }).success).toBe(
      false,
    ));
  it.each([0, -1, 1441])("rejects invalid minutes %s", (minutes) =>
    expect(entrySchema.safeParse({ ...entry, minutes }).success).toBe(false),
  );
  it("accepts a complete February period", () =>
    expect(() =>
      assertPeriod(new Date("2026-02-01"), new Date("2026-02-28")),
    ).not.toThrow());
  it("rejects partial monthly periods", () =>
    expect(() =>
      assertPeriod(new Date("2026-02-02"), new Date("2026-02-28")),
    ).toThrow());
  it("rejects work outside period", () =>
    expect(() =>
      validateEntries(
        [{ ...entry, workDate: "2026-03-01" }],
        new Date("2026-02-01"),
        new Date("2026-02-28"),
        policy,
        "Asia/Kolkata",
      ),
    ).toThrow());
  it("does not hardcode eight-hour maximum", () =>
    expect(() =>
      validateEntries(
        [{ ...entry, minutes: 600 }],
        new Date("2026-02-01"),
        new Date("2026-02-28"),
        policy,
        "Asia/Kolkata",
      ),
    ).not.toThrow());
  it("enforces configured daily maximum across entries", () =>
    expect(() =>
      validateEntries(
        [
          { ...entry, minutes: 300 },
          { ...entry, minutes: 300 },
        ],
        new Date("2026-02-01"),
        new Date("2026-02-28"),
        { ...policy, maxDailyMinutes: 500 },
        "Asia/Kolkata",
      ),
    ).toThrow());
  it("rejects totals beyond a calendar day", () =>
    expect(() =>
      validateEntries(
        [
          { ...entry, minutes: 1000 },
          { ...entry, minutes: 1000 },
        ],
        new Date("2026-02-01"),
        new Date("2026-02-28"),
        policy,
        "Asia/Kolkata",
      ),
    ).toThrow());
  it("computes targets from configured days and holidays", () =>
    expect(
      expectedMinutes(new Date("2026-02-01"), new Date("2026-02-28"), policy, [
        "2026-02-02",
      ]),
    ).toBe(19 * 450));
  it.each(["=SUM(A1:A2)", "+12", "-12", "@IMPORT", "  =bad", "\t=bad"])(
    "neutralizes CSV formula %s",
    (value) => expect(csvCell(value)).toMatch(/^"'/),
  );
  it("escapes CSV quotes and preserves commas", () =>
    expect(csvCell('Review "A", B')).toBe('"Review ""A"", B"'));
});
