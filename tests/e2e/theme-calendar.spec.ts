import { expect, test } from "@playwright/test";
import { STATE } from "./helpers";

test.describe("theme", () => {
  test("one tap switches theme: moon in light, sun in dark; it survives a reload", async ({ page }) => {
    await page.goto("/");
    const html = page.locator("html");
    await expect(html).not.toHaveClass(/(^| )dark( |$)/);
    const toDark = page.getByRole("button", { name: "Modo oscuro" });
    await expect(toDark.locator("svg.lucide-moon")).toBeVisible();
    await toDark.click();

    await expect(html).toHaveClass(/(^| )dark( |$)/);
    const toLight = page.getByRole("button", { name: "Modo claro" });
    await expect(toLight.locator("svg.lucide-sun")).toBeVisible();
    await expect(page.getByRole("button", { name: "Modo oscuro" })).toHaveCount(0);

    // Applied before paint on the next page load: no flash of the light theme.
    await page.goto("/reservar");
    await expect(html).toHaveClass(/(^| )dark( |$)/);
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgb(13, 19, 21)");

    await page.getByRole("button", { name: "Modo claro" }).click();
    await expect(html).not.toHaveClass(/(^| )dark( |$)/);
  });

  test("until someone picks, it follows the operating system", async ({ browser }) => {
    const ctx = await browser.newContext({ colorScheme: "dark" });
    const page = await ctx.newPage();
    await page.goto("http://127.0.0.1:3100/");
    await expect(page.locator("html")).toHaveClass(/(^| )dark( |$)/);
    await expect(page.getByRole("button", { name: "Modo claro" })).toBeVisible();
    await ctx.close();
  });
});

test.describe("agenda calendar", () => {
  test.use({ storageState: STATE.staff });

  test("month view shows a calendar; a day opens its agenda; the mini calendar jumps dates", async ({ page }) => {
    await page.goto("/admin/agenda?vista=mes");
    const grid = page.getByRole("grid");
    await expect(grid).toBeVisible();
    await expect(page.getByText(/turnos en el mes/)).toBeVisible();

    // Any weekday cell of the month (outside days are dimmed but still clickable).
    const day = grid.getByRole("button", { name: /^(lunes|martes|miércoles|jueves|viernes),? \d+ de [a-z]+: / }).first();
    await day.click();
    await expect(page).toHaveURL(/vista=dia&fecha=\d{4}-\d{2}-\d{2}/);

    // Mini calendar next to the day grid (wide screens).
    const mini = page.getByRole("grid");
    await expect(mini).toBeVisible();
    const before = new URL(page.url()).searchParams.get("fecha");
    await mini.getByRole("button", { name: /^[a-záéíóú]+,? \d+ de [a-z]+/ }).nth(20).click();
    await expect.poll(() => new URL(page.url()).searchParams.get("fecha")).not.toBe(before);
    await expect(page).toHaveURL(/vista=dia/);
  });
});
