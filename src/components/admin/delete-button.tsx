import { ConfirmAction } from "@/components/admin/confirm-action";
import { Button } from "@/components/ui/button";

/** "Dar de baja" with confirmation; posts the entity id to a server action. */
export function DeleteButton({
  id,
  action,
  redirectTo,
  title,
  description = "Deja de aparecer en el panel y al reservar. El historial se conserva.",
  label = "Dar de baja",
}: {
  id: string;
  action: (fd: FormData) => Promise<{ ok?: boolean; message?: string }>;
  redirectTo: string;
  title: string;
  description?: string;
  label?: string;
}) {
  return (
    <ConfirmAction trigger={<Button variant="outline">{label}</Button>} title={title} description={description} confirmLabel={label} action={action} redirectTo={redirectTo}>
      <input type="hidden" name="id" value={id} />
    </ConfirmAction>
  );
}
