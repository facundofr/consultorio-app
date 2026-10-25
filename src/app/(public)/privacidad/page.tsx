import type { Metadata } from "next";
import { assistantConfig } from "@/server/assistant/config";

export const metadata: Metadata = { title: "Privacidad y datos personales" };

export default function PrivacyPage() {
  // Same value the cleanup job uses, so this text can never drift from it.
  const days = assistantConfig().retentionDays;
  return (
    <article className="flex max-w-prose flex-col gap-5 leading-relaxed">
      <h1 className="text-3xl font-bold tracking-tight">Privacidad y datos personales</h1>
      <p>
        Para reservar un turno te pedimos solo tu nombre y apellido, un teléfono y un email. No te pedimos diagnósticos, síntomas ni datos de tu historia clínica, y te pedimos que no los escribas en el chat.
      </p>
      <h2 className="text-xl font-semibold">Para qué usamos tus datos</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>Reservar, confirmar, recordarte y, si lo pedís, cancelar tu turno.</li>
        <li>Que la clínica pueda contactarte por cambios en la agenda.</li>
      </ul>
      <p>No los usamos para publicidad ni los compartimos con terceros fuera de la clínica que elegiste.</p>
      <h2 className="text-xl font-semibold">Cómo los protegemos</h2>
      <p>
        Tu teléfono y tu email se guardan cifrados. Las conversaciones con el asistente se guardan solo para controlar la calidad del servicio y se borran automáticamente a los {days} días. Los emails que te enviamos se borran de nuestros servidores apenas salen. El acceso del equipo de la clínica queda registrado.
      </p>
      <h2 className="text-xl font-semibold">El asistente de IA</h2>
      <p>
        Para entender lo que escribís, el asistente envía tus mensajes a un proveedor externo de inteligencia artificial (Groq, Google Gemini u OpenRouter). Antes de enviarlos borramos cualquier teléfono, email o número de documento que aparezca, y tu nombre, teléfono y email de la reserva nunca pasan por el asistente: los cargás en un formulario aparte. El asistente no da consejos médicos. Si preferís no usarlo, podés reservar con el formulario.
      </p>
      <h2 className="text-xl font-semibold">Tus derechos</h2>
      <p>
        Según la Ley 25.326 de Protección de Datos Personales, podés pedir acceso, rectificación o supresión de tus datos comunicándote con la clínica. La Agencia de Acceso a la Información Pública, órgano de control de la ley, atiende las denuncias y reclamos relacionados con el incumplimiento de las normas sobre protección de datos personales.
      </p>
    </article>
  );
}
