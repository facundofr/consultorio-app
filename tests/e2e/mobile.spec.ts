import { expect, test, type Page } from "@playwright/test";
import { STATE } from "./helpers";

// Phone-sized viewport: the bottom tab bar replaces the top menus.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

/** Optional screenshots for design review: SHOTS_DIR=… pnpm test:e2e mobile */
async function shot(page: Page, name: string) {
  if (process.env.SHOTS_DIR) await page.screenshot({ path: `${process.env.SHOTS_DIR}/${name}.png` });
}

const bar = (page: Page) => page.getByRole("navigation", { name: "Navegación principal" });

test.describe("mobile: patient", () => {
  test("bottom bar with a raised Reservar button and a Más sheet", async ({ page }) => {
    await page.goto("/");
    await expect(bar(page)).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Principal", exact: true })).toBeHidden();
    await expect(bar(page).getByRole("link", { name: "Inicio" })).toHaveAttribute("aria-current", "page");
    await shot(page, "paciente-inicio");

    await bar(page).getByRole("link", { name: "Reservar" }).click();
    await expect(page).toHaveURL(/\/reservar/);
    await expect(bar(page).getByRole("link", { name: "Reservar" })).toHaveAttribute("aria-current", "page");

    await bar(page).getByRole("button", { name: "Más" }).click();
    const sheet = page.getByRole("dialog", { name: "Más opciones" });
    await expect(sheet.getByRole("link", { name: "Llamar al 911" })).toHaveAttribute("href", "tel:911");
    await expect(sheet.getByRole("link", { name: /Ingreso del equipo/ })).toBeVisible();
    await shot(page, "paciente-mas");
  });

  test("the chat input stays above the bar", async ({ page }) => {
    await page.goto("/asistente?clinica=aurora");
    const input = page.getByLabel("Tu mensaje");
    const [inputBox, barBox] = await Promise.all([input.boundingBox(), bar(page).boundingBox()]);
    expect(inputBox!.y + inputBox!.height).toBeLessThanOrEqual(barBox!.y);
    await shot(page, "paciente-asistente");
  });
});

test.describe("mobile: front desk", () => {
  test.use({ storageState: STATE.staff });

  test("Nuevo turno opens the booking dialog; Más has only what front desk may use", async ({ page }) => {
    await page.goto("/admin");
    await expect(bar(page).getByRole("link", { name: /^Agenda/ })).toBeVisible();
    await shot(page, "recepcion-inicio");

    await bar(page).getByRole("link", { name: "Nuevo turno" }).click();
    await expect(page.getByRole("dialog", { name: "Agendar turno" })).toBeVisible();
    await shot(page, "recepcion-nuevo-turno");
    await page.keyboard.press("Escape");

    await bar(page).getByRole("button", { name: "Más" }).click();
    const sheet = page.getByRole("dialog", { name: "Más opciones" });
    await expect(sheet.getByRole("link", { name: "Turnos", exact: true })).toBeVisible();
    await expect(sheet.getByRole("button", { name: "Cerrar sesión" })).toBeVisible();
    await expect(sheet.getByRole("link", { name: "Usuarios" })).toHaveCount(0);
    await expect(sheet.getByRole("link", { name: "Conversaciones" })).toHaveCount(0);
    await shot(page, "recepcion-mas");
  });
});

test.describe("mobile: clinic admin", () => {
  test.use({ storageState: STATE.admin });

  test("Más includes the admin sections and navigates", async ({ page }) => {
    await page.goto("/admin");
    await bar(page).getByRole("button", { name: "Más" }).click();
    const sheet = page.getByRole("dialog", { name: "Más opciones" });
    await expect(sheet.getByRole("link", { name: "Conversaciones" })).toBeVisible();
    await sheet.getByRole("link", { name: "Usuarios" }).click();
    await expect(page).toHaveURL(/\/admin\/usuarios/);
    await expect(sheet).toBeHidden();
  });
});

test.describe("desktop", () => {
  test.use({ viewport: { width: 1280, height: 800 } });
  test("no bottom bar", async ({ page }) => {
    await page.goto("/");
    await expect(bar(page)).toBeHidden();
  });
});
