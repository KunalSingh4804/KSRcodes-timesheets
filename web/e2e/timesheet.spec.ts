import { test, expect } from "@playwright/test";
test("employee can save a daily entry, refresh and see the preserved work", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Enter workspace", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: /Welcome back, Aarav/ }),
  ).toBeVisible();
  await page.getByRole("link", { name: "My timesheet", exact: true }).click();
  await page.getByRole("button", { name: "Add entry", exact: true }).click();
  const description = `E2E contribution ${Date.now()}`;
  await page
    .getByRole("textbox", { name: "What did you work on?" })
    .fill(description);
  await page.getByRole("spinbutton", { name: "Hours", exact: true }).fill("1");
  await page
    .getByRole("spinbutton", { name: "Minutes", exact: true })
    .fill("15");
  await page.getByRole("button", { name: "Save entry", exact: true }).click();
  await expect(page.getByText(description, { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText(description, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Submit month", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Submit your monthly timesheet?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Keep editing", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
test("mobile viewport keeps entry controls usable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Enter workspace", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: /Welcome back, Aarav/ }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await page.getByRole("link", { name: "My timesheet", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Add entry", exact: true }),
  ).toBeVisible();
});
