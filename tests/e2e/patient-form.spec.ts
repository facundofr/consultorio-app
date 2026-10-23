import { expect, test } from "@playwright/test";
import { fixtures } from "./helpers";

test.describe("patient: booking with the form", () => {
  test("books through every step, sees real times, gets a confirmation, a calendar file and cancels by link", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Reservar un turno" }).click();

    await page.getByRole("link", { name: "Centro Médico Aurora" }).click();
    await page.getByRole("link", { name: /^Sede Centro/ }).click();
    await page.getByRole("link", { name: /^Cardiología/ }).click();
    // Only one cardiologist: the professional step is skipped automatically.
    await expect(page.getByText("Dr. Andrés Molinari")).toBeVisible();
    await page.getByRole("link", { name: /^Consulta/ }).click();

    await expect(page.getByRole("heading", { name: "¿Qué día te queda bien?" })).toBeVisible();
    await page.getByRole("link", { name: /hay turnos/ }).nth(1).click();

    await expect(page.getByRole("heading", { name: "Elegí el horario" })).toBeVisible();
    const tickets = page.locator("main section ul a");
    await expect(tickets.first()).toBeVisible();
    const time = (await tickets.first().locator("span").first().textContent())!.trim();
    await tickets.first().click();

    await expect(page.getByRole("heading", { name: "Revisá y confirmá tu turno" })).toBeVisible();
    await expect(page.getByText(time, { exact: true })).toBeVisible();

    // Validation: nothing filled.
    await page.getByRole("button", { name: "Confirmar turno" }).click();
    await expect(page.getByText("Ingresá nombre y apellido.")).toBeVisible();
    await expect(page.getByText("Para reservar necesitamos que aceptes el uso de tus datos.")).toBeVisible();

    await page.getByLabel("Nombre y apellido").fill("Julia Formulario");
    await page.getByLabel("Teléfono celular").fill("11 6100-2233");
    await page.getByLabel("Email", { exact: true }).fill("julia.form@example.com");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Confirmar turno" }).click();

    await expect(page.getByRole("heading", { name: /¡Listo, Julia! Tu turno está confirmado/ })).toBeVisible();
    await expect(page).toHaveURL(/\/turno\/T-[2-9A-Z]{6}\?t=.+&nuevo=1/);
    await expect(page.getByText(time, { exact: true })).toBeVisible();

    // Calendar file.
    const icsHref = await page.getByRole("link", { name: "Agregar al calendario" }).getAttribute("href");
    const ics = await page.request.get(icsHref!);
    expect(ics.headers()["content-type"]).toContain("text/calendar");
    expect(await ics.text()).toContain("BEGIN:VEVENT");

    // Cancel with the link (well before 24 h).
    await page.getByRole("button", { name: "Cancelar turno" }).click();
    await page.getByRole("button", { name: "Sí, cancelar" }).click();
    await expect(page.getByText("Listo, tu turno quedó cancelado.")).toBeVisible();
    // Offer to reschedule: the wizard opens at the day step with the same choices.
    await page.getByRole("link", { name: /Elegir otro día y horario con Dr. Andrés Molinari/ }).click();
    await expect(page.getByRole("heading", { name: "¿Qué día te queda bien?" })).toBeVisible();
    await page.goBack();
    await page.reload();
    await expect(page.getByText("Cancelado", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Cancelar turno" })).toHaveCount(0);
  });

  test("the next free slot shortcut goes straight to confirmation, and the link can be saved", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/reservar?clinica=aromos");
    await page.getByRole("link", { name: /^Nutrición/ }).click();
    await page.getByRole("link", { name: /^Seguimiento/ }).click();

    const shortcut = page.getByRole("link", { name: /El próximo turno libre/ });
    await expect(shortcut).toBeVisible();
    const time = (await shortcut.textContent())!.match(/(\d{2}:\d{2}) h/)![1];
    await shortcut.click();
    await expect(page.getByRole("heading", { name: "Revisá y confirmá tu turno" })).toBeVisible();
    await expect(page.getByText(time, { exact: true })).toBeVisible();

    await page.getByLabel("Nombre y apellido").fill("Nora Atajo");
    await page.getByLabel("Teléfono celular").fill("11 6300-4455");
    await page.getByLabel("Email", { exact: true }).fill("nora.atajo@example.com");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Confirmar turno" }).click();

    await expect(page.getByRole("heading", { name: "Guardá este enlace" })).toBeVisible();
    await page.getByRole("button", { name: "Copiar enlace" }).click();
    await expect(page.getByRole("button", { name: "¡Copiado!" })).toBeVisible();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toMatch(/\/turno\/T-[2-9A-Z]{6}\?t=/);
    expect(copied).not.toContain("nuevo=1");
  });

  test("a bad link does not reveal anything", async ({ page }) => {
    const { soon } = fixtures();
    await page.goto(`/turno/${soon.code}?t=not-the-token`);
    await expect(page.getByRole("heading", { name: "No encontramos el turno" })).toBeVisible();
    await expect(page.getByText("Paciente Ventana Cerrada")).toHaveCount(0);
  });
});

test.describe("patient: cancellation window", () => {
  test("inside the last 24 h the link shows the appointment but blocks online cancellation", async ({ page }) => {
    const { soon } = fixtures();
    await page.goto(`/turno/${soon.code}?t=${encodeURIComponent(soon.token)}`);
    await expect(page.getByRole("heading", { name: "Tu turno" })).toBeVisible();
    await expect(page.getByText("Ya no se puede cancelar online.")).toBeVisible();
    await expect(page.getByRole("link", { name: "011 4000-1000" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Cancelar turno" })).toHaveCount(0);
  });

  test("looking it up with code + phone shows the same block", async ({ page }) => {
    const { soon } = fixtures();
    await page.goto("/turno");
    await page.getByLabel("Código del turno").fill(soon.code.toLowerCase());
    await page.getByLabel("Teléfono o email con que reservaste").fill("+54 9 " + soon.phone);
    await page.getByRole("button", { name: "Buscar mi turno" }).click();
    await expect(page.getByText("Ya no se puede cancelar online.")).toBeVisible();
  });

  test("a wrong phone gets a generic error", async ({ page }) => {
    const { soon } = fixtures();
    await page.goto("/turno");
    await page.getByLabel("Código del turno").fill(soon.code);
    await page.getByLabel("Teléfono o email con que reservaste").fill("11 9999-9999");
    await page.getByRole("button", { name: "Buscar mi turno" }).click();
    await expect(page.getByText("No encontramos un turno con esos datos.", { exact: false })).toBeVisible();
  });
});
