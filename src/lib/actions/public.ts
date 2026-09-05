"use server";

import { prisma } from "@/lib/prisma";
import { getAvailableSlots, getWindowForDate, toBusyIntervals, breaksForDate } from "@/lib/slots";
import { keyToDate, dateToKey, formatDateHuman, minutesToTime as toTime, nowART } from "@/lib/format";
import { normalizePhone } from "@/lib/phone";
import { sendAppointmentConfirmationEmail } from "@/lib/email";
import { sendWhatsAppTemplate, notifyOwner } from "@/lib/whatsapp";
import { toWhatsAppNumber } from "@/lib/phone";
import { revalidatePath } from "next/cache";

export async function getAvailability(serviceId: string, dateKey: string) {
  const service = await prisma.service.findUnique({ where: { id: serviceId }, include: { dayHours: true } });
  if (!service || !service.active) return { ok: false as const, error: "Servicio no disponible." };

  const date = keyToDate(dateKey);
  const [override, openDate] = await Promise.all([
    prisma.dateOverride.findUnique({ where: { date } }),
    service.requiresDateConfirmation
      ? prisma.serviceOpenDate.findUnique({ where: { serviceId_date: { serviceId, date } } })
      : Promise.resolve(null),
  ]);
  const window = getWindowForDate(service, date, override, service.dayHours, openDate);
  if (!window) return { ok: true as const, slots: [] as number[] };

  const [appointments, breaks] = await Promise.all([
    prisma.appointment.findMany({
      where: { date, status: { not: "cancelado" } },
      select: { startMin: true, endMin: true, status: true },
    }),
    prisma.businessBreak.findMany({ where: { active: true } }),
  ]);

  const slots = getAvailableSlots({
    window,
    duration: service.duration,
    busy: [...toBusyIntervals(appointments), ...breaksForDate(breaks, date)],
    date,
  });

  return { ok: true as const, slots };
}

/** Fechas (dateKey) dentro de los próximos `daysAhead` días en las que este
 * servicio tiene al menos un horario libre — se usa para la reserva web, así
 * el selector de día solo muestra fechas realmente reservables (ej. si el
 * servicio solo atiende viernes/sábados, o tiene Agenda con fechas puntuales
 * confirmadas, no aparecen miércoles ni días sin confirmar). Mismo criterio
 * que ya usa el bot de WhatsApp (src/lib/bot/flow.ts, sendDateOptions). */
export async function getAvailableDateKeys(serviceId: string, daysAhead: number = 70): Promise<string[]> {
  const dateKeys: string[] = [];
  const today = nowART();
  for (let i = 0; i < daysAhead; i++) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + i));
    dateKeys.push(dateToKey(d));
  }
  const results = await Promise.all(dateKeys.map((key) => getAvailability(serviceId, key)));
  return dateKeys.filter((_, i) => {
    const r = results[i];
    return r.ok && r.slots.length > 0;
  });
}

export interface CreateBookingInput {
  serviceId: string;
  dateKey: string;
  startMin: number;
  name: string;
  phone: string;
  email?: string;
  notes?: string;
  source?: string; // "online" (default, reserva web) | "whatsapp_bot"
}

export async function createBooking(input: CreateBookingInput) {
  const name = input.name.trim();
  const phone = normalizePhone(input.phone);

  if (!name || name.length < 2) return { ok: false as const, error: "Ingresá tu nombre." };
  if (!phone || phone.length < 8) {
    return { ok: false as const, error: "Ingresá un teléfono válido." };
  }

  const service = await prisma.service.findUnique({ where: { id: input.serviceId }, include: { dayHours: true } });
  if (!service || !service.active) return { ok: false as const, error: "Servicio no disponible." };

  const date = keyToDate(input.dateKey);
  const [override, openDate] = await Promise.all([
    prisma.dateOverride.findUnique({ where: { date } }),
    service.requiresDateConfirmation
      ? prisma.serviceOpenDate.findUnique({ where: { serviceId_date: { serviceId: service.id, date } } })
      : Promise.resolve(null),
  ]);
  const window = getWindowForDate(service, date, override, service.dayHours, openDate);
  if (!window) return { ok: false as const, error: "Ese día no hay atención para este servicio." };

  const endMin = input.startMin + service.duration;

  // Revalidamos disponibilidad justo antes de guardar, por si alguien más
  // reservó ese horario mientras esta persona completaba el formulario.
  const conflict = await prisma.appointment.findFirst({
    where: {
      date,
      status: { not: "cancelado" },
      startMin: { lt: endMin },
      endMin: { gt: input.startMin },
    },
  });
  if (conflict) {
    return { ok: false as const, error: "Ese horario se acaba de ocupar. Elegí otro, por favor." };
  }

  const activeBreaks = await prisma.businessBreak.findMany({ where: { active: true } });
  const breakConflict = breaksForDate(activeBreaks, date).some(
    (b) => input.startMin < b.endMin && endMin > b.startMin
  );
  if (breakConflict) {
    return { ok: false as const, error: "Ese horario está dentro de una pausa. Elegí otro, por favor." };
  }
  if (input.startMin < window.startMin || endMin > window.endMin) {
    return { ok: false as const, error: "Ese horario ya no está disponible." };
  }

  const email = input.email?.trim() || null;
  const client = await prisma.client.upsert({
    where: { phone },
    update: { name, ...(email ? { email } : {}) },
    create: { name, phone, email },
  });

  const appointment = await prisma.appointment.create({
    data: {
      clientId: client.id,
      serviceId: service.id,
      date,
      startMin: input.startMin,
      endMin,
      notes: input.notes?.trim() || null,
      source: input.source || "online",
    },
  });

  revalidatePath("/admin");
  revalidatePath("/admin/turnos");

  if (email) {
    // No bloqueamos la respuesta al usuario si el mail tarda o falla.
    sendAppointmentConfirmationEmail({
      to: email,
      clientName: name,
      serviceName: service.name,
      dateLabel: formatDateHuman(input.dateKey),
      timeLabel: toTime(input.startMin),
      price: service.price,
    }).catch((err) => console.error("[email] fallo enviando confirmación:", err));
  }

  // Confirmación por WhatsApp (además del mail). Requiere que el número esté
  // conectado a la Cloud API (coexistencia resuelta) y la plantilla
  // "confirmacion_turno_rb" aprobada por Meta — hasta entonces esto falla en
  // silencio y no rompe la reserva.
  if (input.source !== "whatsapp_bot") {
    sendWhatsAppTemplate({
      to: toWhatsAppNumber(phone),
      templateName: "confirmacion_turno_rb",
      bodyParams: [name, service.name, formatDateHuman(input.dateKey), toTime(input.startMin)],
    }).catch((err) => console.error("[whatsapp] fallo enviando confirmación:", err));

    // Aviso a Romina de que entró un turno nuevo desde la web (el del bot ya
    // se avisa aparte, dentro del flujo del bot, para no duplicar el aviso).
    notifyOwner(
      `📅 Nuevo turno (reserva web): ${name} · ${service.name} · ${formatDateHuman(input.dateKey)} ${toTime(input.startMin)} · tel ${phone}.`
    ).catch((err) => console.error("[whatsapp] fallo notificando a Romina:", err));
  }

  return { ok: true as const, appointmentId: appointment.id };
}
