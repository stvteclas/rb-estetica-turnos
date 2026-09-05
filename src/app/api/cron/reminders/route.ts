// Recordatorios automáticos por WhatsApp + cancelación automática de turnos
// reservados por el bot cuya seña nunca llegó.
//
// EN PRODUCCIÓN (03/09/2026, ajustado a pedido de Pablo) corre UNA VEZ AL DÍA
// a las 12:00 hora Argentina (15:00 UTC, ver vercel.json) — el plan gratuito
// (Hobby) de Vercel permite como máximo un cron por día, así que en vez de
// pelear con eso se decidió simplificar: el recordatorio de "48hs antes" ya
// no mide horas exactas, sino que dispara para TODOS los turnos cuya fecha
// sea exactamente 2 días después de hoy, sin mirar el horario del turno
// (columna reminder48SentAt evita mandarlo dos veces si el cron se reintenta
// el mismo día). El recordatorio "corto" (0-4hs antes) queda como best-effort:
// solo va a alcanzar a los turnos que caigan en esa ventana justo a las 12:00,
// es una limitación aceptada. La cancelación por seña vencida (48hs sin pagar)
// sigue igual, revisada una vez al día.
//
// Protegido con CRON_SECRET — hay que mandarlo como ?secret=... o
// Authorization: Bearer <CRON_SECRET>.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { appointmentDateTimeUTC, dateToKey, formatDateHuman, minutesToTime, nowART } from "@/lib/format";
import { sendWhatsAppTemplate, notifyOwner } from "@/lib/whatsapp";
import { toWhatsAppNumber } from "@/lib/phone";
import { sendReminder48 } from "@/lib/reminders";

// Cuántas horas tiene la clienta para pagar la seña antes de que el turno se
// libere solo — coincide con el texto de los Términos y condiciones de la
// seña (Mi cuenta), que le dice a la clienta "tenés 48hs para abonar".
const DEPOSIT_DEADLINE_HOURS = 48;

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const fromQuery = req.nextUrl.searchParams.get("secret");
  const authHeader = req.headers.get("authorization");
  const fromHeader = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  return fromQuery === secret || fromHeader === secret;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 401 });
  }

  const now = Date.now();
  // Usamos nowART (hora de Argentina) como base de "hoy", no new Date() en
  // UTC directo — mismo bug de zona horaria que en slots.ts (punto 19) y en
  // "Turnos de hoy"/otros lugares (punto 23): si este cron alguna vez vuelve
  // a correr cerca de la medianoche UTC (21-24hs ART), new Date() ya cae en
  // el día siguiente para Argentina.
  const nowArt = nowART();
  const today = dateToKey(nowArt);
  const in2Days = dateToKey(new Date(nowArt.getTime() + 2 * 24 * 60 * 60 * 1000));
  const in3Days = dateToKey(new Date(nowArt.getTime() + 3 * 24 * 60 * 60 * 1000));

  const appointments = await prisma.appointment.findMany({
    where: {
      status: "confirmado",
      depositStatus: { in: ["pagado", "no_requerido"] },
      date: { gte: new Date(`${today}T00:00:00.000Z`), lte: new Date(`${in3Days}T00:00:00.000Z`) },
      OR: [{ reminder48SentAt: null }, { reminderShortSentAt: null }],
    },
    include: { client: true, service: true },
  });

  let sent48 = 0;
  let sentShort = 0;
  let failed = 0;

  for (const appt of appointments) {
    const dateKey = dateToKey(appt.date);
    const apptTime = appointmentDateTimeUTC(dateKey, appt.startMin);
    const diffHours = (apptTime.getTime() - now) / (60 * 60 * 1000);
    const to = toWhatsAppNumber(appt.client.phone);
    const when = `${formatDateHuman(dateKey)} a las ${minutesToTime(appt.startMin)}`;

    try {
      if (!appt.reminder48SentAt && dateKey === in2Days) {
        // Misma función que usa el botón manual de la grilla (src/lib/reminders.ts)
        // — un solo lugar arma y manda este mensaje, para el cron y para Romina.
        await sendReminder48(appt.id);
        sent48++;
      } else if (!appt.reminderShortSentAt && diffHours <= 4 && diffHours > 0) {
        await sendWhatsAppTemplate({
          to,
          templateName: "recordatorio_corto_rb",
          bodyParams: [appt.client.name, appt.service.name, minutesToTime(appt.startMin)],
        });
        await prisma.appointment.update({ where: { id: appt.id }, data: { reminderShortSentAt: new Date() } });
        sentShort++;
      }
    } catch (e) {
      console.error(`No se pudo mandar recordatorio para turno ${appt.id}:`, e);
      failed++;
    }
  }

  // --- Cancelación automática por seña vencida ---
  // Turnos reservados por el bot (con seña pedida) que a esta altura ya
  // deberían tener la seña pagada y no la tienen — ni "pagado" ni siquiera
  // "pendiente"/"rechazado" resuelto a tiempo. Se cancelan y liberan el
  // horario para que otra clienta lo pueda tomar.
  const deadline = new Date(now - DEPOSIT_DEADLINE_HOURS * 60 * 60 * 1000);
  const unpaid = await prisma.appointment.findMany({
    where: {
      status: "confirmado",
      depositStatus: { in: ["pendiente", "rechazado"] },
      createdAt: { lte: deadline },
    },
    include: { client: true, service: true },
  });

  let cancelled = 0;
  let cancelFailed = 0;

  for (const appt of unpaid) {
    try {
      await prisma.appointment.update({ where: { id: appt.id }, data: { status: "cancelado" } });
      cancelled++;

      const when = `${formatDateHuman(dateToKey(appt.date))} a las ${minutesToTime(appt.startMin)}`;
      try {
        // Puede fallar si la plantilla "sena_vencida_utilidad_rb" todavía no está dada
        // de alta/aprobada en Meta — no rompe la cancelación en sí, que ya
        // quedó guardada arriba.
        await sendWhatsAppTemplate({
          to: toWhatsAppNumber(appt.client.phone),
          templateName: "sena_vencida_utilidad_rb",
          bodyParams: [appt.client.name, appt.service.name, when],
        });
      } catch (e) {
        console.error(`No se pudo avisarle a la clienta la cancelación del turno ${appt.id}:`, e);
      }

      await notifyOwner(
        `🚫 Turno cancelado por falta de seña (más de ${DEPOSIT_DEADLINE_HOURS}hs sin pagar): ${appt.client.name} · ${appt.service.name} · ${when}. Horario liberado.`
      );
    } catch (e) {
      console.error(`No se pudo cancelar el turno ${appt.id} por seña vencida:`, e);
      cancelFailed++;
    }
  }

  return NextResponse.json({
    ok: true,
    sent48,
    sentShort,
    failed,
    checked: appointments.length,
    cancelled,
    cancelFailed,
    unpaidChecked: unpaid.length,
  });
}
