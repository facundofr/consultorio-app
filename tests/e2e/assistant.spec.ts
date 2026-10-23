import { expect, test } from "@playwright/test";
import { STATE } from "./helpers";

// The E2E server runs with LLM_MOCK=1: a scripted local model that uses the real tools.

test.describe("patient: booking with the assistant", () => {
  test("asks in the chat, taps a real slot, confirms with the form card and opens the appointment", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Hablar con el asistente" }).click();
    await page.getByRole("link", { name: "Centro Médico Aurora" }).click();

    const log = page.getByRole("log", { name: "Conversación con el asistente" });
    await expect(log.getByText("Soy el asistente de turnos")).toBeVisible();

    await page.getByLabel("Tu mensaje").fill("Hola, quiero un turno de cardiología");
    await page.keyboard.press("Enter");

    const slots = log.getByRole("region", { name: "Horarios de Cardiología" }).getByRole("button");
    await expect(slots.first()).toBeVisible();
    await expect(log.getByText("Encontré horarios de Cardiología")).toBeVisible();
    const time = (await slots.first().locator("span").first().textContent())!.trim();
    await slots.first().click();

    const card = log.getByRole("region", { name: "Confirmar turno" });
    await expect(card).toBeVisible();
    await expect(card.getByText("Dr. Andrés Molinari", { exact: false })).toBeVisible();

    // Without consent it does not book.
    await card.getByLabel("Nombre y apellido").fill("Marta Asistente");
    await card.getByLabel("Teléfono celular").fill("11 6200-3344");
    await card.getByLabel("Email", { exact: true }).fill("marta.chat@example.com");
    await card.getByRole("button", { name: "Confirmar turno" }).click();
    await expect(card.getByText("Para reservar necesitamos que aceptes el uso de tus datos.")).toBeVisible();

    await card.getByRole("checkbox").check();
    await card.getByRole("button", { name: "Confirmar turno" }).click();

    const done = log.getByRole("region", { name: "Turno confirmado" });
    await expect(done).toBeVisible();
    await expect(done.getByText(/T-[2-9A-Z]{6}/)).toBeVisible();
    // The earlier slot buttons can no longer book a second appointment by accident.
    await expect(slots.first()).toBeDisabled();
    await expect(log.getByText("Ya reservaste un turno")).toBeVisible();
    await done.getByRole("link", { name: /Ver mi turno/ }).click();
    await expect(page).toHaveURL(/\/turno\/T-[2-9A-Z]{6}\?t=.+&nuevo=1/);
    await expect(page.getByText(time, { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Guardá este enlace" })).toBeVisible();
  });

  test("an emergency gets the emergency numbers right away", async ({ page }) => {
    await page.goto("/asistente?clinica=aromos");
    await page.getByLabel("Tu mensaje").fill("mi papá tiene dolor en el pecho");
    await page.getByRole("button", { name: "Enviar" }).click();
    const alert = page.getByRole("region", { name: "Emergencia" });
    await expect(alert.getByRole("link", { name: "Llamar al 911" })).toHaveAttribute("href", "tel:911");
  });

  test("the cancel suggestion opens the secure lookup form inside the chat", async ({ page }) => {
    await page.goto("/asistente?clinica=aurora");
    await page.getByRole("button", { name: "Quiero cancelar mi turno" }).click();
    const card = page.getByRole("region", { name: "Cancelar un turno" });
    await expect(card.getByLabel("Código del turno")).toBeVisible();
    await expect(card.getByLabel("Teléfono o email con que reservaste")).toBeVisible();
  });
});

test.describe("panel: assistant conversations", () => {
  test.use({ storageState: STATE.admin });

  test("the clinic admin sees the conversation that booked, with its tools", async ({ page }) => {
    await page.goto("/admin/conversaciones?estado=booked");
    await page.getByRole("row").nth(1).getByRole("link").first().click();
    await expect(page.getByRole("heading", { name: /Conversación del/ })).toBeVisible();
    await expect(page.getByText("Buscó horarios")).toBeVisible();
    await expect(page.getByText(/Turno resultante/)).toBeVisible();
    // Phones and emails never reach the transcript.
    await expect(page.getByText("6200-3344")).toHaveCount(0);
  });
});
