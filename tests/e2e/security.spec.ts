import { expect, test, type Page } from "@playwright/test";
import { totpCode, totpStep } from "../../src/lib/totp";
import { PASSWORD, STATE } from "./helpers";

/** A code for a step the server has not seen yet (codes are single use). */
let lastStepUsed = 0;
function freshCode(secret: string) {
  const step = Math.max(totpStep(), lastStepUsed + 1);
  lastStepUsed = step;
  return totpCode(secret, step);
}

async function signIn(page: Page, email: string) {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByRole("button", { name: "Ingresar" }).click();
}

test.describe("two-factor sign-in", () => {
  test("set up, sign in with a code, then with a backup code", async ({ page }) => {
    const email = "admin@aromos.example";
    await signIn(page, email);
    await expect(page.getByRole("heading", { name: "Inicio" })).toBeVisible();

    // Setup from "Mi cuenta y seguridad".
    await page.goto("/admin/seguridad");
    await page.getByRole("button", { name: "Activar doble factor" }).click();
    await expect(page.getByRole("img", { name: "Código QR para la app de autenticación" })).toBeVisible();
    const secret = (await page.locator("code").first().textContent())!.replace(/\s/g, "");
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    await page.getByLabel("Código de 6 números de la app").fill("000000");
    await page.getByRole("button", { name: "Confirmar y activar" }).click();
    await expect(page.getByText(/El código no es correcto/)).toBeVisible();
    await page.getByLabel("Código de 6 números de la app").fill(freshCode(secret));
    await page.getByRole("button", { name: "Confirmar y activar" }).click();
    await expect(page.getByText("Guardá estos códigos de respaldo")).toBeVisible();
    const backup = (await page.locator("li", { hasText: /^[2-9A-Z]{4}-[2-9A-Z]{4}$/ }).first().textContent())!.trim();
    await page.getByRole("button", { name: "Ya los guardé" }).click();
    await expect(page.getByText("Activado.")).toBeVisible();
    await page.getByRole("button", { name: "Salir" }).click();

    // The password alone is no longer enough.
    await signIn(page, email);
    await expect(page).toHaveURL(/\/admin\/login\/verificar/);
    await page.goto("/admin/turnos");
    await expect(page).toHaveURL(/\/admin\/login\/verificar/);
    await page.getByLabel("Código de 6 números").fill("123456");
    await page.getByRole("button", { name: "Verificar" }).click();
    await expect(page.getByText(/El código no es correcto/)).toBeVisible();
    await page.getByLabel("Código de 6 números").fill(freshCode(secret));
    await page.getByRole("button", { name: "Verificar" }).click();
    await expect(page.getByRole("heading", { name: "Inicio" })).toBeVisible();

    // Lost phone: a backup code works once.
    await page.goto("/admin/seguridad");
    await page.getByRole("button", { name: "Salir" }).click();
    await signIn(page, email);
    await page.getByRole("button", { name: /usar un código de respaldo/ }).click();
    await page.getByLabel("Código de respaldo").fill(backup);
    await page.getByRole("button", { name: "Verificar" }).click();
    await expect(page.getByRole("heading", { name: "Inicio" })).toBeVisible();
  });
});

test.describe("emails and permissions", () => {
  test.describe("administration", () => {
    test.use({ storageState: STATE.admin });

    test("sees the booking confirmations in the test inbox", async ({ page }) => {
      await page.goto("/admin/emails");
      await expect(page.getByRole("heading", { name: "Emails a pacientes" })).toBeVisible();
      await expect(page.getByText("Modo de prueba")).toBeVisible();
      const row = page.getByRole("row").filter({ hasText: "Confirmación" }).first();
      await expect(row).toBeVisible();
      await row.getByRole("link").first().click();
      await expect(page.getByText(/^Para:/)).toBeVisible();
      const preview = page.frameLocator('iframe[title="Vista previa del email"]');
      await expect(preview.getByText("Ver o cancelar mi turno")).toBeVisible();
    });
  });

  test.describe("front desk", () => {
    test.use({ storageState: STATE.staff });

    test("cannot open emails nor export patient data", async ({ page }) => {
      const res = await page.goto("/admin/emails");
      expect(res?.status()).toBe(404);
      await page.goto("/admin/turnos");
      await expect(page.getByRole("link", { name: "Exportar CSV" })).toHaveCount(0);
      const csv = await page.request.get("/admin/exportar-turnos");
      expect(csv.status()).toBe(403);
    });
  });
});

test.describe("security headers", () => {
  test("pages carry a strict CSP and nothing is blocked by it", async ({ page }) => {
    const violations: string[] = [];
    page.on("console", (m) => {
      if (/Content Security Policy|Refused to/i.test(m.text())) violations.push(m.text());
    });
    const res = await page.goto("/");
    const csp = res?.headers()["content-security-policy"] ?? "";
    expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(res?.headers()["x-frame-options"]).toBe("DENY");
    await page.goto("/reservar");
    await page.goto("/admin/login");
    await page.goto("/privacidad");
    expect(violations).toEqual([]);
  });

  test("Better Auth's sign-in endpoint is closed", async ({ request }) => {
    const r = await request.post("/api/auth/sign-in/email", { data: { email: "admin@aurora.example", password: PASSWORD } });
    expect(r.status()).toBe(404);
  });
});
