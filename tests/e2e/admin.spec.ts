import { expect, test } from "@playwright/test";
import { nextWorkday, STATE } from "./helpers";

test.describe("front desk", () => {
  test.use({ storageState: STATE.staff });

  test("books manually from the agenda, moves and cancels the appointment", async ({ page }) => {
    const date = nextWorkday(3);
    await page.goto(`/admin/agenda?modo=profesional&vista=dia&fecha=${date}`);
    await page.getByLabel("Profesional", { exact: true }).selectOption({ label: "Dra. Lucía Ferrante" });
    await page.getByRole("button", { name: "Mostrar" }).click();
    await expect(page).toHaveURL(/id=/);

    // Book: new patient, first free slot.
    await page.getByRole("button", { name: "Agendar turno", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Agendar turno" });
    await dialog.getByRole("button", { name: "Paciente nuevo" }).click();
    await dialog.getByLabel("Nombre y apellido").fill("Rocío E2E Manual");
    await dialog.getByLabel("Teléfono").fill("11 6000-1234");
    await dialog.getByLabel("Email (opcional)").fill("rocio.e2e@example.com");
    await dialog.getByLabel("Día").fill(date);
    const slots = dialog.getByRole("group", { name: "Horarios libres" }).getByRole("button");
    await expect(slots.first()).toBeVisible();
    const firstTime = (await slots.first().textContent())!.trim().slice(0, 5);
    await slots.first().click();
    await expect(slots.first()).toHaveAttribute("aria-pressed", "true");
    await dialog.getByRole("button", { name: "Agendar turno" }).click();
    await expect(page.getByText(/Turno T-[2-9A-Z]{6} agendado/)).toBeVisible();

    // It shows up in the grid at the chosen time.
    const card = page.getByRole("button", { name: new RegExp(`${firstTime}, Rocío E2E Manual`) });
    await expect(card).toBeVisible();

    // Move it to another free slot.
    await card.click();
    await page.getByRole("dialog").getByRole("button", { name: "Mover" }).click();
    const move = page.getByRole("dialog", { name: "Mover turno" });
    const moveSlots = move.getByRole("group", { name: "Horarios libres" }).getByRole("button");
    await expect(moveSlots.nth(1)).toBeVisible();
    const newTime = (await moveSlots.nth(2).textContent())!.trim().slice(0, 5);
    await moveSlots.nth(2).click();
    await move.getByRole("button", { name: "Mover turno" }).click();
    await expect(page.getByText("Turno movido.")).toBeVisible();
    const moved = page.getByRole("button", { name: new RegExp(`${newTime}, Rocío E2E Manual`) });
    await expect(moved).toBeVisible();

    // Cancel it: the card disappears and the slot is free again.
    await moved.click();
    await page.getByRole("dialog").getByRole("button", { name: "Cancelar turno" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Cancelar turno" }).click();
    await expect(page.getByText("Turno cancelado. El horario quedó libre.")).toBeVisible();
    await expect(moved).toHaveCount(0);

    // The appointment list keeps it as cancelled, with full history.
    await page.goto(`/admin/turnos?desde=${date}&hasta=${date}&q=Rocío`);
    await page.getByRole("link", { name: new RegExp(newTime) }).click();
    await expect(page.getByText("Canceló la clínica")).toBeVisible();
    await expect(page.getByText("Turno movido", { exact: true })).toBeVisible();
    await expect(page.getByText("Turno creado", { exact: true })).toBeVisible();
  });

  test("cannot open configuration screens reserved to admins", async ({ page }) => {
    await page.goto("/admin/usuarios");
    await expect(page.getByText("404")).toBeVisible();
    await page.goto("/admin/sedes");
    await expect(page.getByRole("link", { name: "Nueva sede" })).toHaveCount(0);
  });
});

test.describe("clinic admin", () => {
  test.use({ storageState: STATE.admin });

  test("adds a professional with a weekly schedule that shows up in the agenda", async ({ page }) => {
    await page.goto("/admin/profesionales/nuevo");
    await page.getByLabel("Tratamiento").fill("Dr.");
    await page.getByRole("textbox", { name: "Nombre", exact: true }).fill("Ezequiel");
    await page.getByRole("textbox", { name: "Apellido", exact: true }).fill("Prueba");
    await page.getByLabel("Clínica médica").check();
    await page.getByLabel("Sede Centro").check();
    await page.getByRole("button", { name: "Crear y cargar horarios" }).click();
    await expect(page.getByRole("heading", { name: "Dr. Ezequiel Prueba" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Horario semanal" })).toHaveAttribute("aria-current", "page");

    await page.getByRole("button", { name: "Agregar franja" }).click();
    await page.getByLabel("Día").selectOption({ label: "Martes" });
    await page.getByLabel("Desde", { exact: true }).fill("14:00");
    await page.getByLabel("Hasta", { exact: true }).fill("16:00");
    await page.getByRole("button", { name: "Guardar horario" }).click();
    await expect(page.getByText("Horario guardado.")).toBeVisible();

    const tuesday = nextWorkday(2, 2);
    await page.getByRole("link", { name: "Ver agenda" }).click();
    await page.waitForURL(/\/admin\/agenda\?modo=profesional&id=/);
    await page.goto(page.url() + `&vista=dia&fecha=${tuesday}`);
    await expect(page.getByRole("button", { name: /Atiende de 14:00 a 16:00/ })).toBeVisible();
  });

  test("blocks a day for a professional and the agenda shows it", async ({ page }) => {
    const day = nextWorkday(4);
    await page.goto("/admin/excepciones");
    await page.getByLabel("Alcance").selectOption("professional");
    await page.getByLabel("Profesional", { exact: true }).selectOption({ label: "Dra. Lucía Ferrante" });
    await page.getByLabel("Desde el").fill(day);
    await page.getByLabel("Hasta el (inclusive)").fill(day);
    await page.getByLabel("Motivo").fill("Congreso E2E");
    await page.getByRole("button", { name: "Agregar bloqueo" }).click();
    await expect(page.getByText(/^Guardado/)).toBeVisible();
    await expect(page.getByText("Congreso E2E").first()).toBeVisible();
  });
});
