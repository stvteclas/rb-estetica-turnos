// Recordatorio de "48hs antes" (instrucciones de preparación) — lógica
// compartida entre el cron automático (src/app/api/cron/reminders/route.ts)
// y el botón manual "Enviar recordatorio" en la grilla de turnos del día
// (pedido de Romina, 04/09/2026). Extraído a una función aparte para que los
// dos caminos manden EXACTAMENTE el mismo mensaje — nunca un texto compuesto
// aparte para el botón manual.

import { prisma } from "@/lib/prisma";
import { formatDateHuman, minutesToTime, dateToKey } from "@/lib/format";
import { sendWhatsAppTemplate } from "@/lib/whatsapp";
import { toWhatsAppNumber } from "@/lib/phone";

/**
 * Arma y manda el recordatorio de 48hs (plantilla `recordatorio_preparacion_rb`)
 * para un turno puntual, y marca `reminder48SentAt`. Se puede llamar tanto
 * automáticamente (cron) como a demanda (botón manual) — en ambos casos
 * queda registrado el mismo campo, así que la grilla siempre muestra el
 * estado real sin importar quién lo mandó.
 */
export async function sendReminder48(appointmentId: string): Promise<void> {
  const appt = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { client: true, service: true },
  });
  if (!appt) throw new Error("Turno no encontrado.");

  const dateKey = dateToKey(appt.date);
  const when = `${formatDateHuman(dateKey)} a las ${minutesToTime(appt.startMin)}`;
  const prep =
    appt.service.prepInstructions || "No hace falta ninguna preparación especial, ¡nos vemos pronto!";

  await sendWhatsAppTemplate({
    to: toWhatsAppNumber(appt.client.phone),
    templateName: "recordatorio_preparacion_rb",
    bodyParams: [appt.client.name, appt.service.name, when, prep],
  });

  await prisma.appointment.update({
    where: { id: appointmentId },
    data: { reminder48SentAt: new Date() },
  });
}
