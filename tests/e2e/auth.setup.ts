import { expect, test as setup } from "@playwright/test";

import { PASSWORD, STATE } from "./helpers";

async function login(page: import("@playwright/test").Page, email: string, file: string) {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page.getByRole("heading", { name: "Inicio" })).toBeVisible();
  await page.context().storageState({ path: file });
}

setup("login as front desk", async ({ page }) => {
  await login(page, "recepcion@aurora.example", STATE.staff);
});

setup("login as clinic admin", async ({ page }) => {
  await login(page, "admin@aurora.example", STATE.admin);
});

setup("wrong password is rejected", async ({ page }) => {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill("admin@aromos.example");
  await page.getByLabel("Contraseña").fill("not-the-password");
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page.getByText("El email o la contraseña no son correctos.")).toBeVisible();
});
