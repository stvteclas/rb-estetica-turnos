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
      if (!dateKey) {
        await sendWhatsAppText(phone, "Elegí un día de la lista, por favor 🙂");
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
      if (!startMin) {
        await sendWhatsAppText(phone, "Elegí un horario de la lista, por favor 🙂");
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

      const expectedAmount = Number(data.depositAmount) || DEPOSIT.amount;
      const check = await verifyDepositReceipt({
        imageBuffer: buffer,
        mimeType,
        expectedAmount,
        expectedAlias: DEPOSIT.alias,
        expectedAccountHolder: DEPOSIT.accountHolder,
      });

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

        const service = await prisma.service.findUnique({ where: { id: data.serviceId } });
        const when = `${formatDateHuman(data.dateKey)} a las ${minutesToTime(Number(data.startMin))}`;
        let confirmMsg = `¡Seña confirmada! 🎉 Tu turno de *${data.serviceName}* el ${when} quedó confirmado.\n\nTe esperamos en ${BUSINESS.address}.`;
        if (service?.prepInstructions) {
          confirmMsg += `\n\n📋 *Cómo venir preparada:*\n${service.prepInstructions}`;
        }
        await sendWhatsAppText(phone, confirmMsg);
        await notifyOwner(
          `✅ Seña confirmada automáticamente: ${data.serviceName}, ${when}, tel ${phone}. Comprobante: ${receiptUrl || "no se pudo guardar"}.`
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
          `⚠️ Comprobante NO coincide (revisar a mano): ${data.serviceName}, tel ${phone}. Motivo IA: ${check.reason}. Imagen: ${receiptUrl || "no se pudo guardar"}.`
        );
      }
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
