// Bot de reserva de turnos por WhatsApp. Guía a la clienta paso a paso:
// elegir servicio -> elegir día -> elegir horario -> (si es nueva) nombre ->
// reserva el turno en la misma base que usa la app/admin -> pide la seña ->
// valida el comprobante -> confirma.
//
// Estado de la conversación: modelo BotConversation (una fila por teléfono).

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/phone";
import { dateToKey, formatDateHuman, formatMoney, minutesToTime, nowART } from "@/lib/format";
import { getAvailability, createBooking } from "@/lib/actions/public";
import { DEPOSIT, BUSINESS } from "@/lib/business";
import {
  sendWhatsAppText,
  sendWhatsAppList,
  downloadWhatsAppMedia,
  notifyOwner,
  WhatsAppListRow,
} from "@/lib/whatsapp";
import { verifyDepositReceipt } from "@/lib/bot/receipt";

const MAX_DAYS_AHEAD = 70; // hasta cuántos días adelante ofrece fechas (~10 semanas, igual que la Agenda de servicios en /admin)
const MAX_LIST_ROWS = 10; // límite de WhatsApp para mensajes de lista

// Pedido de Romina (02/09/2026): si ella le contesta a mano a una clienta
// desde la app de WhatsApp Business (mismo número que el bot, modo
// "coexistencia"), el bot tiene que dejar de mandarle mensajes a esa
// clienta por un rato — no tiene sentido que el bot le siga pidiendo que
// elija una opción si Romina ya la está atendiendo personalmente.
// Pasado este tiempo sin que Romina le vuelva a escribir, el bot retoma
// normalmente (por si Romina solo contestó un mensaje suelto y no seguía
// la conversación).
export const HUMAN_TAKEOVER_HOURS = 12;

interface IncomingMessage {
  from: string; // número normalizado internacional que manda WhatsApp (ej. "5493543...")
  text?: string;
  interactiveRowId?: string;
  imageMediaId?: string;
  imageMimeType?: string;
}

async function getConversation(phone: string) {
  return prisma.botConversation.upsert({
    where: { phone },
    update: {},
    create: { phone, step: "inicio" },
  });
}

async function setStep(phone: string, step: string, data?: Record<string, unknown>, appointmentId?: string | null) {
  await prisma.botConversation.update({
    where: { phone },
    data: {
      step,
      ...(data !== undefined ? { data: data as Prisma.InputJsonValue } : {}),
      ...(appointmentId !== undefined ? { appointmentId } : {}),
    },
  });
}

async function resetConversation(phone: string) {
  await prisma.botConversation.update({ where: { phone }, data: { step: "inicio", data: Prisma.JsonNull, appointmentId: null } });
}

/** Llamado desde el webhook cuando llega un "smb_message_echoes" (Romina le
 * escribió a mano a esta clienta desde la app de WhatsApp Business). Marca
 * la conversación como "tomada por un humano" para que el bot se calle. */
export async function markHumanTakeover(rawPhone: string) {
  const phone = normalizePhone(rawPhone);
  await prisma.botConversation.upsert({
    where: { phone },
    update: { humanTakeoverAt: new Date() },
    create: { phone, step: "inicio", humanTakeoverAt: new Date() },
  });
}

function isUnderHumanTakeover(humanTakeoverAt: Date | null): boolean {
  if (!humanTakeoverAt) return false;
  const hoursSince = (Date.now() - humanTakeoverAt.getTime()) / (1000 * 60 * 60);
  return hoursSince < HUMAN_TAKEOVER_HOURS;
}

async function sendServiceMenu(phone: string) {
  const services = await prisma.service.findMany({ where: { active: true }, orderBy: { name: "asc" } });
  const rows: WhatsAppListRow[] = services.map((s) => ({
    id: s.id,
    title: s.name.slice(0, 24),
    description: `${formatMoney(s.price)} · ${s.duration} min`,
  }));
  await sendWhatsAppList({
    to: phone,
    bodyText: `¡Hola! 👋 Soy el asistente de ${BUSINESS.name}. Elegí el servicio para el que querés reservar turno:`,
    buttonText: "Ver servicios",
    sectionTitle: "Nuestros servicios",
    rows,
  });
}

async function sendDateOptions(phone: string, serviceId: string, serviceName: string) {
  const today = nowART();
  const dateKeys: string[] = [];
  for (let i = 0; i < MAX_DAYS_AHEAD; i++) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + i));
    dateKeys.push(dateToKey(d));
  }
  // Consultamos la disponibilidad de todos los días en paralelo (en vez de uno
  // por uno) para no acumular la latencia de ~20 consultas seguidas a la base
  // y arriesgarnos a que la función se corte por timeout antes de responder.
  const availabilities = await Promise.all(dateKeys.map((dateKey) => getAvailability(serviceId, dateKey)));
  const rows: WhatsAppListRow[] = [];
  for (let i = 0; i < dateKeys.length && rows.length < MAX_LIST_ROWS; i++) {
    const dateKey = dateKeys[i];
    const availability = availabilities[i];
    if (availability.ok && availability.slots.length > 0) {
      rows.push({ id: dateKey, title: formatDateHuman(dateKey).slice(0, 24), description: `${availability.slots.length} horarios libres` });
    }
  }
  if (rows.length === 0) {
    await sendWhatsAppText(
      phone,
      `No encontramos turnos disponibles para ${serviceName} en los próximos días. Escribinos al ${BUSINESS.whatsapp} y te ayudamos a mano.`
    );
    return false;
  }
  await sendWhatsAppList({
    to: phone,
    bodyText: `Perfecto, *${serviceName}*. ¿Qué día te queda mejor?`,
    buttonText: "Ver días",
    sectionTitle: "Días disponibles",
    rows,
  });
  return true;
}

async function sendTimeOptions(phone: string, serviceId: string, dateKey: string) {
  const availability = await getAvailability(serviceId, dateKey);
  if (!availability.ok || availability.slots.length === 0) {
    await sendWhatsAppText(phone, "Ese día ya no tiene horarios libres. Te muestro los días disponibles de nuevo.");
    return false;
  }
  const rows: WhatsAppListRow[] = availability.slots.slice(0, MAX_LIST_ROWS).map((min) => ({
    id: String(min),
    title: minutesToTime(min),
  }));
  await sendWhatsAppList({
    to: phone,
    bodyText: `Horarios disponibles para el ${formatDateHuman(dateKey)}:`,
    buttonText: "Ver horarios",
    sectionTitle: "Horarios",
    rows,
  });
  return true;
}

async function askName(phone: string) {
  await sendWhatsAppText(phone, "Para terminar de reservar, decime tu *nombre y apellido* 🙂");
}

async function finalizeBooking(phone: string, name: string, data: any) {
  try {
    const result = await createBooking({
      serviceId: data.serviceId,
      dateKey: data.dateKey,
      startMin: Number(data.startMin),
      name,
      phone,
      notes: "Reservado por WhatsApp (bot).",
      source: "whatsapp_bot",
    });

    if (!result.ok) {
      await sendWhatsAppText(phone, `${result.error} Volvamos a intentar — elegí el servicio de nuevo:`);
      await sendServiceMenu(phone);
      await setStep(phone, "esperando_servicio", {});
      return;
    }

    const service = await prisma.service.findUnique({ where: { id: data.serviceId } });
    const depositAmount = service?.depositAmount ?? DEPOSIT.amount;

    await prisma.appointment.update({
      where: { id: result.appointmentId },
      data: { depositStatus: "pendiente", depositAmount },
    });

    const serviceName = data.serviceName;
    const when = `${formatDateHuman(data.dateKey)} a las ${minutesToTime(Number(data.startMin))}`;

    const settings = await prisma.businessSettings.findUnique({ where: { id: "singleton" } });
    const termsBlock = settings?.depositTerms ? `\n\n📌 *Términos y condiciones de la seña:*\n${settings.depositTerms}` : "";

    await sendWhatsAppText(
      phone,
      `¡Listo! Turno reservado ✅\n\n*${serviceName}*\n${when}\n\nPara confirmarlo necesitamos una seña de *${formatMoney(depositAmount)}*.\n\nAlias: *${DEPOSIT.alias}*\n\nApenas transfieras, mandanos la *foto del comprobante* acá mismo y confirmamos el turno al toque.${termsBlock}`
    );

    await notifyOwner(`📅 Nuevo turno (bot WhatsApp): ${name} · ${serviceName} · ${when} · tel ${phone}. Queda pendiente de seña.`);

    await setStep(phone, "esperando_comprobante", { ...data, depositAmount }, result.appointmentId);
  } catch (e) {
    // Blindaje (05/09/2026, punto 24): antes, cualquier error acá (por ejemplo
    // un startMin corrupto, ver el fix de "esperando_horario" arriba) dejaba
    // a la clienta sin ninguna respuesta y la conversación pegada para
    // siempre en el mismo paso. Ahora se loguea, se avisa a Romina/Pablo por
    // WhatsApp (no depender de los logs de Vercel, que se borran a la media
    // hora en el plan Hobby), se le pide disculpas a la clienta y se
    // reinicia la conversación para que un "hola" la saque del pozo.
    console.error("Error en finalizeBooking (bot WhatsApp):", e);
    await notifyOwner(
      `⚠️ El bot tuvo un error armando el turno de ${name} (tel ${phone}) y no pudo responderle. Revisar a mano. Error: ${e instanceof Error ? e.message : String(e)}`
    );
    await sendWhatsAppText(
      phone,
      "Uy, tuvimos un problema técnico armando tu turno 😕 Probá de nuevo escribiendo *hola*, o escribinos directo y te ayudamos a mano."
    );
    await resetConversation(phone);
  }
}

/**
 * Procesa una foto/PDF de comprobante contra UN turno puntual (lo busca
 * fresco en la base, no depende de los datos que haya guardados en la
 * conversación) — la usan tanto el paso normal "esperando_comprobante" como
 * el blindaje de más abajo (comprobante que llega en cualquier otro paso).
 */
async function processReceiptForAppointment(phone: string, msg: IncomingMessage, appointmentId: string) {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { service: true },
  });
  if (!appointment || !msg.imageMediaId) {
    await resetConversation(phone);
    await sendWhatsAppText(phone, "Se nos perdió el turno en curso, empecemos de nuevo. Escribí *hola*.");
    return;
  }

  const { buffer, mimeType } = await downloadWhatsAppMedia(msg.imageMediaId);
  let receiptUrl: string | null = null;
  try {
    const { put } = await import("@vercel/blob");
    const ext = mimeType === "application/pdf" ? "pdf" : mimeType.split("/")[1] || "jpg";
    const blob = await put(`comprobantes/${appointmentId}-${Date.now()}.${ext}`, buffer, {
      access: "public",
      contentType: mimeType,
    });
    receiptUrl = blob.url;
  } catch (e) {
    console.error("No se pudo guardar el comprobante en Blob storage:", e);
  }

  const expectedAmount = appointment.depositAmount ?? DEPOSIT.amount;
  const check = await verifyDepositReceipt({
    imageBuffer: buffer,
    mimeType,
    expectedAmount,
    expectedAlias: DEPOSIT.alias,
    expectedAccountHolder: DEPOSIT.accountHolder,
  });

  const serviceName = appointment.service.name;
  const when = `${formatDateHuman(dateToKey(appointment.date))} a las ${minutesToTime(appointment.startMin)}`;

  if (check.matches) {
    await prisma.appointment.update({
      where: { id: appointmentId },
      data: { depositStatus: "pagado", depositConfirmedAt: new Date(), depositReceiptUrl: receiptUrl },
    });

    // Registramos la seña en la misma cuenta/caja que usa Romina desde el
    // panel (modal "Método de pago"), para que quede todo en un solo lugar.
    await prisma.payment.create({
      data: {
        appointmentId,
        amount: expectedAmount,
        method: "transferencia",
        source: "bot",
        note: "Seña confirmada automáticamente por el bot de WhatsApp.",
      },
    });

    let confirmMsg = `¡Seña confirmada! 🎉 Tu turno de *${serviceName}* el ${when} quedó confirmado.\n\nTe esperamos en ${BUSINESS.address}.`;
    if (appointment.service.prepInstructions) {
      confirmMsg += `\n\n📋 *Cómo venir preparada:*\n${appointment.service.prepInstructions}`;
    }
    await sendWhatsAppText(phone, confirmMsg);
    await notifyOwner(
      `✅ Seña confirmada automáticamente: ${serviceName}, ${when}, tel ${phone}. Comprobante: ${receiptUrl || "no se pudo guardar"}.`
    );
    await resetConversation(phone);
  } else {
    await prisma.appointment.update({
      where: { id: appointmentId },
      data: { depositStatus: "rechazado", depositReceiptUrl: receiptUrl },
    });
    await sendWhatsAppText(
      phone,
      `No pudimos confirmar el pago automáticamente con esa imagen (${check.reason}). Probá mandar una foto más clara del comprobante, o escribinos al ${BUSINESS.whatsapp} y lo revisamos a mano.`
    );
    await notifyOwner(
      `⚠️ Comprobante NO coincide (revisar a mano): ${serviceName}, tel ${phone}. Motivo IA: ${check.reason}. Imagen: ${receiptUrl || "no se pudo guardar"}.`
    );
  }
}

export async function handleIncomingMessage(msg: IncomingMessage) {
  const phone = normalizePhone(msg.from);
  const conversation = await getConversation(phone);

  // Si Romina le está atendiendo a mano por WhatsApp Business (ver
  // markHumanTakeover / smb_message_echoes en el webhook), el bot no
  // contesta absolutamente nada en esta conversación mientras dure la
  // pausa — ni siquiera "cancelar" reactiva nada, para no pisarle la charla.
  // DESACTIVADO TEMPORALMENTE (03/09/2026): se sospecha que este chequeo se
  // activaba solo (sin que Romina escribiera a mano) y dejaba a la clienta
  // sin respuesta del bot por 12hs. Ver claude/turnos-app-fixes-pendientes.md
  // punto 13 para el diagnostico completo antes de reactivar.
  if (false && isUnderHumanTakeover(conversation.humanTakeoverAt)) {
    return;
  }

  const data = (conversation.data as any) || {};
  const text = (msg.text || "").trim().toLowerCase();

  // Comandos globales, disponibles en cualquier paso.
  if (text === "cancelar" || text === "reiniciar") {
    await resetConversation(phone);
    await sendWhatsAppText(phone, "Listo, cancelé lo que estábamos haciendo. Escribí *hola* cuando quieras reservar un turno.");
    return;
  }
  // "hola" como reinicio global (agregado 03/09/2026): si la conversación
  // quedó trabada en un paso intermedio (por ejemplo de una prueba
  // anterior) y la clienta vuelve a escribir "hola", arrancamos de nuevo
  // en vez de repetirle el mensaje del paso viejo (ej. "Elegí un día de la
  // lista, por favor" sin haber mostrado nunca el menú de servicios). Se
  // excluye "esperando_comprobante" a propósito: ahí ya hay un turno
  // reservado esperando la seña, no queremos perder ese hilo por un "hola"
  // suelto — ese paso ya tiene su propio mensaje de recordatorio.
  if (text === "hola" && conversation.step !== "inicio" && conversation.step !== "esperando_comprobante") {
    await resetConversation(phone);
    await sendServiceMenu(phone);
    await setStep(phone, "esperando_servicio", {});
    return;
  }
  if (text.includes("hablar con alguien") || text.includes("humano") || text.includes("persona")) {
    await sendWhatsAppText(phone, `Ya te derivo con el equipo de ${BUSINESS.name}, te responden a la brevedad por acá mismo.`);
    await notifyOwner(`Una clienta (${phone}) pidió hablar con una persona por WhatsApp.`);
    return;
  }

  // Blindaje (05/09/2026, pedido de Pablo tras el caso de Cintia Arias, ver
  // claude/turnos-app-fixes-pendientes.md punto 24): si llega una foto/PDF de
  // comprobante y la conversación NO está en el paso "esperando_comprobante"
  // (por ejemplo porque quedó trabada en otro paso, o porque Romina ya le
  // pidió la seña a mano y la clienta manda la foto acá igual), no dejamos
  // que el paso actual (que no espera una imagen) le conteste cualquier
  // cosa. En cambio buscamos en la base si esa clienta tiene un turno
  // confirmado con la seña todavía pendiente/rechazada y lo procesamos
  // igual — así no depende de que el "step" guardado esté sincronizado.
  if (msg.imageMediaId && conversation.step !== "esperando_comprobante") {
    const pendingAppointment = await prisma.appointment.findFirst({
      where: {
        client: { phone },
        status: "confirmado",
        depositStatus: { in: ["pendiente", "rechazado"] },
      },
      orderBy: { createdAt: "desc" },
    });
    if (pendingAppointment) {
      await setStep(phone, "esperando_comprobante", { depositAmount: pendingAppointment.depositAmount }, pendingAppointment.id);
      await processReceiptForAppointment(phone, msg, pendingAppointment.id);
      return;
    }
    // No hay ningún turno con seña pendiente para este teléfono: puede ser
    // que Romina ya lo haya cargado y cobrado a mano, o que el comprobante
    // no corresponda a un turno reservado por acá. Avisamos igual para que
    // se revise, en vez de dejarlo pasar en silencio.
    await notifyOwner(`📎 Llegó un comprobante de ${phone} pero no encontramos ningún turno con seña pendiente a su nombre. Revisar a mano.`);
    await sendWhatsAppText(
      phone,
      "Recibimos tu comprobante, pero no encontramos un turno con seña pendiente a tu nombre. Si ya tenés un turno reservado, escribinos y lo revisamos a mano 🙂"
    );
    return;
  }

  switch (conversation.step) {
    case "inicio": {
      await sendServiceMenu(phone);
      await setStep(phone, "esperando_servicio", {});
      return;
    }

    case "esperando_servicio": {
      const serviceId = msg.interactiveRowId;
      if (!serviceId) {
        await sendWhatsAppText(phone, "Elegí una opción de la lista, por favor 🙂");
        await sendServiceMenu(phone);
        return;
      }
      const service = await prisma.service.findUnique({ where: { id: serviceId } });
      if (!service || !service.active) {
        await sendWhatsAppText(phone, "Ese servicio ya no está disponible, elegí otro:");
        await sendServiceMenu(phone);
        return;
      }
      const nextData = { serviceId: service.id, serviceName: service.name };
      const ok = await sendDateOptions(phone, service.id, service.name);
      if (ok) await setStep(phone, "esperando_fecha", nextData);
      return;
    }

    case "esperando_fecha": {
      const dateKey = msg.interactiveRowId;
      // Blindaje (05/09/2026, ver claude/turnos-app-fixes-pendientes.md punto 24):
      // si la clienta toca un botón de una lista vieja (ej. la lista de
      // servicios de un paso anterior que quedó tocable en el chat), el id
      // que llega acá no tiene forma de fecha (YYYY-MM-DD). Antes se
      // aceptaba cualquier valor truthy y corrompía la reserva más adelante.
      if (!dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
        await sendWhatsAppText(phone, "Elegí un día de la lista más reciente, por favor 🙂");
        if (data.serviceId) await sendDateOptions(phone, data.serviceId, data.serviceName);
        return;
      }
      const nextData = { ...data, dateKey };
      const ok = await sendTimeOptions(phone, data.serviceId, dateKey);
      if (ok) await setStep(phone, "esperando_horario", nextData);
      else await sendDateOptions(phone, data.serviceId, data.serviceName);
      return;
    }

    case "esperando_horario": {
      const startMin = msg.interactiveRowId;
      // Blindaje (05/09/2026, ver claude/turnos-app-fixes-pendientes.md punto 24):
      // este es el bug real que dejó a una clienta (Cintia Arias) con la
      // conversación trabada. Si toca un botón de una lista vieja (ej. una
      // lista de días que quedó tocable en el chat), acá llegaba un dateKey
      // ("2026-09-04") en vez de minutos. Como no se validaba, se guardaba
      // igual como si fuera startMin, y más adelante `Number(startMin)` daba
      // NaN dentro de finalizeBooking → createBooking tiraba una excepción
      // sin capturar → el webhook la loguea y listo (ver route.ts) → la
      // clienta se queda sin respuesta y la conversación no vuelve a avanzar
      // nunca (el step queda pegado en "esperando_nombre" para siempre).
      if (!startMin || !/^\d+$/.test(startMin)) {
        await sendWhatsAppText(phone, "Elegí un horario de la lista más reciente, por favor 🙂");
        if (data.dateKey) await sendTimeOptions(phone, data.serviceId, data.dateKey);
        return;
      }
      const nextData = { ...data, startMin };
      const existingClient = await prisma.client.findUnique({ where: { phone } });
      if (existingClient) {
        await finalizeBooking(phone, existingClient.name, nextData);
      } else {
        await setStep(phone, "esperando_nombre", nextData);
        await askName(phone);
      }
      return;
    }

    case "esperando_nombre": {
      const name = (msg.text || "").trim();
      if (name.length < 2) {
        await askName(phone);
        return;
      }
      await finalizeBooking(phone, name, data);
      return;
    }

    case "esperando_comprobante": {
      if (!msg.imageMediaId) {
        const waitingAmount = Number(data.depositAmount) || DEPOSIT.amount;
        await sendWhatsAppText(
          phone,
          `Todavía estamos esperando la *foto del comprobante* de la seña (${formatMoney(waitingAmount)} al alias ${DEPOSIT.alias}) para confirmar tu turno. Escribí *cancelar* si querés dejarlo sin efecto.`
        );
        return;
      }
      const appointmentId = conversation.appointmentId;
      if (!appointmentId) {
        await resetConversation(phone);
        await sendWhatsAppText(phone, "Se nos perdió el turno en curso, empecemos de nuevo. Escribí *hola*.");
        return;
      }
      await processReceiptForAppointment(phone, msg, appointmentId);
      return;
    }

    default: {
      await resetConversation(phone);
      await sendServiceMenu(phone);
      await setStep(phone, "esperando_servicio", {});
      return;
    }
  }
}
