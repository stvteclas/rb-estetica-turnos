"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/password";
import { COOKIE_NAME, MAX_AGE_SECONDS, createSessionToken } from "@/lib/session";
import { getAdminSession } from "@/lib/auth-guard";
import { keyToDate, timeToMinutes, formatDateHuman, minutesToTime as toTime } from "@/lib/format";
import { normalizePhone } from "@/lib/phone";
import { sendAppointmentConfirmationEmail } from "@/lib/email";
import { sendWhatsAppTemplate } from "@/lib/whatsapp";
import { toWhatsAppNumber } from "@/lib/phone";
import { sendReminder48 } from "@/lib/reminders";

function requireAdmin() {
  const session = getAdminSession();
  if (!session) throw new Error("No autorizado. Iniciá sesión de nuevo.");
  return session;
}

// ---------- Auth ----------

export async function loginAdmin(formData: FormData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const nextUrl = String(formData.get("next") || "/admin");

  const admin = await prisma.adminUser.findUnique({ where: { email } });
  if (!admin || !verifyPassword(password, admin.passwordHash, admin.passwordSalt)) {
    redirect(`/admin/login?error=1&next=${encodeURIComponent(nextUrl)}`);
  }

  const token = createSessionToken(admin!.id);
  cookies().set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });

  redirect(nextUrl || "/admin");
}

export async function logoutAdmin() {
  cookies().delete(COOKIE_NAME);
  redirect("/admin/login");
}

export async function changePassword(formData: FormData) {
  const session = requireAdmin();
  const current = String(formData.get("currentPassword") || "");
  const next = String(formData.get("newPassword") || "");
  const confirm = String(formData.get("confirmPassword") || "");

  const admin = await prisma.adminUser.findUnique({ where: { id: session.id } });
  if (!admin) throw new Error("Usuario no encontrado.");
  if (!verifyPassword(current, admin.passwordHash, admin.passwordSalt)) {
    redirect("/admin/perfil?error=actual");
  }
  if (next.length < 4) {
    redirect("/admin/perfil?error=corta");
  }
  if (next !== confirm) {
    redirect("/admin/perfil?error=nocoincide");
  }

  const { hash, salt } = hashPassword(next);
  await prisma.adminUser.update({
    where: { id: admin.id },
    data: { passwordHash: hash, passwordSalt: salt },
  });

  redirect("/admin/perfil?ok=1");
}

// ---------- Servicios ----------

const ALL_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

/** Lee el horario personalizado por día que carga ServiceForm (checkbox +
 * desde/hasta por cada día) y lo arma como filas para ServiceDayHours. */
function parseDayHours(formData: FormData): { dayOfWeek: number; startMin: number; endMin: number }[] {
  const rows: { dayOfWeek: number; startMin: number; endMin: number }[] = [];
  for (const v of ALL_WEEKDAYS) {
    if (formData.get(`day_enabled_${v}`) === "on") {
      const startMin = timeToMinutes(String(formData.get(`day_start_${v}`) || "09:00"));
      const endMin = timeToMinutes(String(formData.get(`day_end_${v}`) || "18:00"));
      rows.push({ dayOfWeek: v, startMin, endMin });
    }
  }
  return rows;
}

/** availableDays/startMin/endMin del servicio quedan como resumen general
 * (para pantallas viejas / listados), calculados a partir del horario por
 * día: todos los días configurados, y el rango que los cubre a todos. */
function legacyScheduleFields(dayHours: { dayOfWeek: number; startMin: number; endMin: number }[]) {
  if (dayHours.length === 0) return { availableDays: [] as number[], startMin: 540, endMin: 1080 };
  return {
    availableDays: dayHours.map((r) => r.dayOfWeek),
    startMin: Math.min(...dayHours.map((r) => r.startMin)),
    endMin: Math.max(...dayHours.map((r) => r.endMin)),
  };
}

export async function createService(formData: FormData) {
  requireAdmin();
  const dayHours = parseDayHours(formData);
  const legacy = legacyScheduleFields(dayHours);
  await prisma.service.create({
    data: {
      name: String(formData.get("name") || "").trim(),
      category: String(formData.get("category") || "otro"),
      price: Number(formData.get("price") || 0),
      packPrice: formData.get("packPrice") ? Number(formData.get("packPrice")) : null,
      packSessions: formData.get("packSessions") ? Number(formData.get("packSessions")) : null,
      duration: Number(formData.get("duration") || 30),
      description: String(formData.get("description") || "").trim() || null,
      availableDays: legacy.availableDays,
      startMin: legacy.startMin,
      endMin: legacy.endMin,
      depositAmount: formData.get("depositAmount") ? Number(formData.get("depositAmount")) : null,
      prepInstructions: String(formData.get("prepInstructions") || "").trim() || null,
      requiresDateConfirmation: formData.get("requiresDateConfirmation") === "on",
      dayHours: { create: dayHours },
    },
  });
  revalidatePath("/admin/servicios");
  revalidatePath("/admin/horarios");
  revalidatePath("/");
}

export async function updateService(id: string, formData: FormData) {
  requireAdmin();
  const dayHours = parseDayHours(formData);
  const legacy = legacyScheduleFields(dayHours);
  await prisma.service.update({
    where: { id },
    data: {
      name: String(formData.get("name") || "").trim(),
      category: String(formData.get("category") || "otro"),
      price: Number(formData.get("price") || 0),
      packPrice: formData.get("packPrice") ? Number(formData.get("packPrice")) : null,
      packSessions: formData.get("packSessions") ? Number(formData.get("packSessions")) : null,
      duration: Number(formData.get("duration") || 30),
      description: String(formData.get("description") || "").trim() || null,
      availableDays: legacy.availableDays,
      startMin: legacy.startMin,
      endMin: legacy.endMin,
      active: formData.get("active") === "on",
      depositAmount: formData.get("depositAmount") ? Number(formData.get("depositAmount")) : null,
      prepInstructions: String(formData.get("prepInstructions") || "").trim() || null,
      requiresDateConfirmation: formData.get("requiresDateConfirmation") === "on",
      dayHours: { deleteMany: {}, create: dayHours },
    },
  });
  revalidatePath("/admin/servicios");
  revalidatePath("/admin/horarios");
  revalidatePath("/");
}

export async function deleteService(id: string) {
  requireAdmin();
  const count = await prisma.appointment.count({ where: { serviceId: id } });
  if (count > 0) {
    // No borramos servicios con historial de turnos — los desactivamos.
    await prisma.service.update({ where: { id }, data: { active: false } });
  } else {
    await prisma.service.delete({ where: { id } });
  }
  revalidatePath("/admin/servicios");
  revalidatePath("/");
}

// ---------- Agenda de un servicio (fechas puntuales confirmadas) ----------

/** Guarda la agenda de un servicio con requiresDateConfirmation=true: recibe
 * una fecha por cada fila que mandó AgendaForm (name="dates", value=dateKey)
 * y para cada una, si vino tildada ("date_enabled_<key>"), confirma esa fecha
 * (upsert ServiceOpenDate con el horario cargado); si no, la deja sin
 * confirmar (borra el ServiceOpenDate si existía). */
export async function updateServiceAgenda(serviceId: string, formData: FormData) {
  requireAdmin();
  const dateKeys = formData.getAll("dates").map(String);

  for (const dateKey of dateKeys) {
    const date = keyToDate(dateKey);
    const enabled = formData.get(`date_enabled_${dateKey}`) === "on";
    if (enabled) {
      const startMin = timeToMinutes(String(formData.get(`date_start_${dateKey}`) || "09:00"));
      const endMin = timeToMinutes(String(formData.get(`date_end_${dateKey}`) || "18:00"));
      await prisma.serviceOpenDate.upsert({
        where: { serviceId_date: { serviceId, date } },
        update: { startMin, endMin },
        create: { serviceId, date, startMin, endMin },
      });
    } else {
      await prisma.serviceOpenDate.deleteMany({ where: { serviceId, date } });
    }
  }

  revalidatePath(`/admin/servicios/${serviceId}/agenda`);
  revalidatePath("/admin/servicios");
  revalidatePath("/admin/turnos");
  revalidatePath("/admin");
  revalidatePath("/");
  redirect("/admin/servicios");
}

// ---------- Fechas / excepciones de horario ----------

export async function addOverride(formData: FormData) {
  requireAdmin();
  const type = String(formData.get("type") || "closed");
  const dateKey = String(formData.get("date") || "");
  if (!dateKey) return;
  await prisma.dateOverride.upsert({
    where: { date: keyToDate(dateKey) },
    create: {
      date: keyToDate(dateKey),
      type,
      startMin: type === "open" ? timeToMinutes(String(formData.get("startTime") || "09:00")) : null,
      endMin: type === "open" ? timeToMinutes(String(formData.get("endTime") || "18:00")) : null,
      reason: String(formData.get("reason") || "").trim() || null,
    },
    update: {
      type,
      startMin: type === "open" ? timeToMinutes(String(formData.get("startTime") || "09:00")) : null,
      endMin: type === "open" ? timeToMinutes(String(formData.get("endTime") || "18:00")) : null,
      reason: String(formData.get("reason") || "").trim() || null,
    },
  });
  revalidatePath("/admin/horarios");
}

export async function removeOverride(id: string) {
  requireAdmin();
  await prisma.dateOverride.delete({ where: { id } });
  revalidatePath("/admin/horarios");
}

// ---------- Pausas (breaks) ----------

export async function addBreak(formData: FormData) {
  requireAdmin();
  const label = String(formData.get("label") || "").trim() || null;
  const startMin = timeToMinutes(String(formData.get("startTime") || "13:00"));
  const endMin = timeToMinutes(String(formData.get("endTime") || "14:00"));
  const daysRaw = formData.getAll("daysOfWeek").map((d) => Number(d));

  await prisma.businessBreak.create({
    data: {
      label,
      startMin,
      endMin,
      daysOfWeek: daysRaw,
    },
  });
  revalidatePath("/admin/horarios");
  revalidatePath("/admin/turnos");
}

export async function removeBreak(id: string) {
  requireAdmin();
  await prisma.businessBreak.delete({ where: { id } });
  revalidatePath("/admin/horarios");
  revalidatePath("/admin/turnos");
}

// ---------- Turnos ----------

export async function createManualAppointment(formData: FormData) {
  requireAdmin();
  const serviceId = String(formData.get("serviceId") || "");
  const dateKey = String(formData.get("date") || "");
  const startMin = timeToMinutes(String(formData.get("startTime") || "09:00"));
  const phone = normalizePhone(String(formData.get("phone") || ""));
  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim() || null;

  const service = await prisma.service.findUnique({ where: { id: serviceId } });
  if (!service) throw new Error("Servicio inválido.");
  // Pedido de Pablo (05/09/2026): la duración no es configurable acá, siempre
  // usa la del servicio — se sacó el override manual del formulario.
  const duration = service.duration;

  const client = await prisma.client.upsert({
    where: { phone },
    update: { ...(name ? { name } : {}), ...(email ? { email } : {}) },
    create: { name: name || "Sin nombre", phone, email },
  });

  await prisma.appointment.create({
    data: {
      clientId: client.id,
      serviceId,
      date: keyToDate(dateKey),
      startMin,
      endMin: startMin + duration,
      notes: String(formData.get("notes") || "").trim() || null,
      source: "manual",
    },
  });

  revalidatePath("/admin/turnos");
  revalidatePath("/admin");

  if (email) {
    sendAppointmentConfirmationEmail({
      to: email,
      clientName: name || client.name,
      serviceName: service.name,
      dateLabel: formatDateHuman(dateKey),
      timeLabel: toTime(startMin),
      price: service.price,
    }).catch((err) => console.error("[email] fallo enviando confirmación:", err));
  }

  sendWhatsAppTemplate({
    to: toWhatsAppNumber(phone),
    templateName: "confirmacion_turno_rb",
    bodyParams: [name || client.name, service.name, formatDateHuman(dateKey), toTime(startMin)],
  }).catch((err) => console.error("[whatsapp] fallo enviando confirmación:", err));
}

export async function updateAppointment(id: string, formData: FormData) {
  requireAdmin();
  const status = String(formData.get("status") || "confirmado");
  const startMin = timeToMinutes(String(formData.get("startTime") || "09:00"));
  const endMin = timeToMinutes(String(formData.get("endTime") || "09:30"));
  const diagnosis = String(formData.get("diagnosis") || "").trim() || null;
  const paymentMethod = String(formData.get("paymentMethod") || "").trim() || null;
  // Fecha del turno — reprogramar a otro día (pedido de Romina, 02/09/2026).
  // Opcional por compatibilidad: si el formulario no la manda, no la tocamos.
  const dateKeyRaw = String(formData.get("date") || "").trim();
  const dateData = dateKeyRaw ? { date: keyToDate(dateKeyRaw) } : {};

  const appt = await prisma.appointment.update({
    where: { id },
    data: { status, startMin, endMin, diagnosis, paymentMethod, ...dateData },
    include: { client: true },
  });

  // Si se cargó un diagnóstico, lo dejamos también como "último diagnóstico"
  // de la clienta para que quede a mano en su ficha.
  if (diagnosis) {
    await prisma.client.update({
      where: { id: appt.clientId },
      data: { lastDiagnosis: diagnosis },
    });
  }

  revalidatePath("/admin/turnos");
  revalidatePath("/admin");
  revalidatePath(`/admin/clientas/${appt.clientId}`);
}

/** Crea un turno nuevo para una clienta que YA existe (botón "Nuevo turno"
 * en la ficha de la clienta, /admin/clientas/[id]) — a diferencia de
 * createManualAppointment (que recibe nombre/teléfono sueltos y hace upsert
 * por teléfono), acá el clientId ya se conoce, así que no hay que
 * reescribir los datos de la clienta a mano. Pedido de Romina (02/09/2026):
 * poder darle un turno a la misma clienta para la siguiente fecha directo
 * desde su historial. */
export async function createAppointmentForClient(clientId: string, formData: FormData) {
  requireAdmin();
  const serviceId = String(formData.get("serviceId") || "");
  const dateKey = String(formData.get("date") || "");
  const startMin = timeToMinutes(String(formData.get("startTime") || "09:00"));

  const [service, client] = await Promise.all([
    prisma.service.findUnique({ where: { id: serviceId } }),
    prisma.client.findUnique({ where: { id: clientId } }),
  ]);
  if (!service) throw new Error("Servicio inválido.");
  if (!client) throw new Error("Clienta inválida.");
  // Pedido de Pablo (05/09/2026): la duración no es configurable acá, siempre
  // usa la del servicio — se sacó el override manual del formulario.
  const duration = service.duration;

  await prisma.appointment.create({
    data: {
      clientId: client.id,
      serviceId,
      date: keyToDate(dateKey),
      startMin,
      endMin: startMin + duration,
      notes: String(formData.get("notes") || "").trim() || null,
      source: "manual",
    },
  });

  revalidatePath("/admin/turnos");
  revalidatePath("/admin");
  revalidatePath(`/admin/clientas/${clientId}`);

  if (client.email) {
    sendAppointmentConfirmationEmail({
      to: client.email,
      clientName: client.name,
      serviceName: service.name,
      dateLabel: formatDateHuman(dateKey),
      timeLabel: toTime(startMin),
      price: service.price,
    }).catch((err) => console.error("[email] fallo enviando confirmación:", err));
  }

  sendWhatsAppTemplate({
    to: toWhatsAppNumber(client.phone),
    templateName: "confirmacion_turno_rb",
    bodyParams: [client.name, service.name, formatDateHuman(dateKey), toTime(startMin)],
  }).catch((err) => console.error("[whatsapp] fallo enviando confirmación:", err));
}

/** Acción liviana para el popup de "acciones rápidas" del turno: cambia
 * solo el estado y/o el medio de pago, sin tocar hora, diagnóstico, etc.
 * (eso queda para el formulario de "Editar"). */
export async function quickUpdateAppointment(
  id: string,
  data: { status?: string; paymentMethod?: string | null }
) {
  requireAdmin();
  const updateData: { status?: string; paymentMethod?: string | null } = {};
  if (data.status !== undefined) updateData.status = data.status;
  if (data.paymentMethod !== undefined) updateData.paymentMethod = data.paymentMethod || null;

  const appt = await prisma.appointment.update({
    where: { id },
    data: updateData,
    include: { client: true },
  });

  revalidatePath("/admin/turnos");
  revalidatePath("/admin");
  revalidatePath(`/admin/clientas/${appt.clientId}`);
}

/** Botón manual "Enviar recordatorio" en la grilla de turnos del día
 * (pedido de Romina, 04/09/2026): respaldo para cuando el cron automático
 * (que ahora corre una vez al día, ver route.ts del cron) no le llega a
 * mandar a tiempo el recordatorio de 48hs a algún turno. Manda EXACTAMENTE
 * el mismo mensaje que el cron — ver src/lib/reminders.ts, no un texto
 * compuesto aparte. Se puede volver a apretar después de un envío por si
 * hace falta reenviarlo (ej. la clienta dice que no le llegó). */
export async function sendManualReminder(appointmentId: string) {
  requireAdmin();
  await sendReminder48(appointmentId);
  revalidatePath("/admin/turnos");
}

// ---------- Configuración del negocio ----------

export async function getBusinessSettings() {
  return prisma.businessSettings.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });
}

export async function updateBusinessSettings(formData: FormData) {
  requireAdmin();
  const depositTerms = String(formData.get("depositTerms") || "").trim() || null;
  await prisma.businessSettings.upsert({
    where: { id: "singleton" },
    update: { depositTerms },
    create: { id: "singleton", depositTerms },
  });
  revalidatePath("/admin/perfil");
}

// ---------- Pagos (caja) ----------

/** Registra un pago sobre un turno (modal "Método de pago" del panel).
 * Independiente de la seña que confirma el bot por WhatsApp (que crea su
 * propio Payment con source="bot" directo en src/lib/bot/flow.ts) — un turno
 * puede tener varios pagos (seña + resto, por ejemplo). */
export async function registerPayment(appointmentId: string, formData: FormData) {
  requireAdmin();
  const amount = Number(formData.get("amount") || 0);
  const method = String(formData.get("method") || "efectivo");
  if (!amount || amount <= 0) throw new Error("Ingresá un monto válido.");

  const appt = await prisma.payment
    .create({
      data: { appointmentId, amount, method, source: "manual" },
    })
    .then(() => prisma.appointment.findUniqueOrThrow({ where: { id: appointmentId } }));

  revalidatePath("/admin/turnos");
  revalidatePath("/admin");
  revalidatePath(`/admin/clientas/${appt.clientId}`);
}

export async function deletePayment(id: string, appointmentId: string) {
  requireAdmin();
  await prisma.payment.delete({ where: { id } });
  revalidatePath("/admin/turnos");
  revalidatePath("/admin");
}

// ---------- Clientas ----------

export async function updateClient(id: string, formData: FormData) {
  requireAdmin();
  const birthDateRaw = String(formData.get("birthDate") || "").trim();
  await prisma.client.update({
    where: { id },
    data: {
      name: String(formData.get("name") || "").trim(),
      phone: normalizePhone(String(formData.get("phone") || "")),
      email: String(formData.get("email") || "").trim() || null,
      birthDate: birthDateRaw ? keyToDate(birthDateRaw) : null,
      lastDiagnosis: String(formData.get("lastDiagnosis") || "").trim() || null,
      notes: String(formData.get("notes") || "").trim() || null,
    },
  });
  revalidatePath(`/admin/clientas/${id}`);
  revalidatePath("/admin/clientas");
  redirect("/admin/clientas");
}
