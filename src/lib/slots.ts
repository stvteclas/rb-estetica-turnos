import { Service, DateOverride, Appointment, BusinessBreak, ServiceDayHours, ServiceOpenDate } from "@prisma/client";
import { dateToKey } from "./format";

export interface Interval {
  startMin: number;
  endMin: number;
}

/** Ventana horaria disponible para un servicio en una fecha dada. Orden de
 * prioridad:
 * 1. Excepción general del negocio (DateOverride: cierra o abre para TODOS
 *    los servicios) — un cierre siempre gana, aunque el servicio tenga
 *    agenda propia.
 * 2. Si el servicio tiene requiresDateConfirmation=true (ej. Depilación, que
 *    no atiende todos los viernes/sábados): esa fecha puntual tiene que estar
 *    confirmada en su Agenda (ServiceOpenDate) — si no está, no está
 *    disponible, aunque el día de la semana esté en su horario habitual.
 * 3. Horario personalizado por día (ServiceDayHours) si el servicio tiene
 *    alguno configurado.
 * 4. Si no tiene nada de lo anterior, la regla vieja de un solo horario para
 *    varios días (availableDays/startMin/endMin), por compatibilidad. */
export function getWindowForDate(
  service: Pick<Service, "availableDays" | "startMin" | "endMin" | "requiresDateConfirmation">,
  date: Date,
  override: DateOverride | null,
  dayHours: Pick<ServiceDayHours, "dayOfWeek" | "startMin" | "endMin">[] = [],
  openDate: Pick<ServiceOpenDate, "startMin" | "endMin"> | null = null
): Interval | null {
  if (override) {
    if (override.type === "closed") return null;
    if (override.type === "open" && override.startMin != null && override.endMin != null) {
      return { startMin: override.startMin, endMin: override.endMin };
    }
  }

  if (service.requiresDateConfirmation) {
    return openDate ? { startMin: openDate.startMin, endMin: openDate.endMin } : null;
  }

  const weekday = date.getUTCDay();
  if (dayHours.length > 0) {
    const custom = dayHours.find((d) => d.dayOfWeek === weekday);
    return custom ? { startMin: custom.startMin, endMin: custom.endMin } : null;
  }
  if (!service.availableDays.includes(weekday)) return null;
  return { startMin: service.startMin, endMin: service.endMin };
}

/** Genera los horarios candidatos (de `duration` en `duration` minutos)
 * dentro de una ventana horaria, y descarta los que se superponen con turnos
 * ya tomados o quedaron en el pasado (si la fecha es hoy). */
export function getAvailableSlots(params: {
  window: Interval;
  duration: number;
  busy: Interval[]; // turnos confirmados ya existentes ese día (cualquier servicio) + pausas
  date: Date;
  now?: Date;
}): number[] {
  const { window, duration, busy, date, now = new Date() } = params;
  const isToday = dateToKey(date) === dateToKey(now);
  const nowMin = now.getUTCHours() * 60 + now.getUTCMinutes();

  // Unimos y ordenamos los intervalos ocupados (turnos + pausas) para calcular
  // los huecos libres reales dentro de la ventana, en vez de probar una grilla
  // fija desde la apertura: así un turno cargado a mano con horario "raro" no
  // corre el resto de los horarios disponibles.
  const sorted = busy
    .map((b) => ({ startMin: Math.max(b.startMin, window.startMin), endMin: Math.min(b.endMin, window.endMin) }))
    .filter((b) => b.startMin < b.endMin)
    .sort((a, b) => a.startMin - b.startMin);

  const merged: Interval[] = [];
  for (const b of sorted) {
    const last = merged[merged.length - 1];
    if (last && b.startMin <= last.endMin) {
      last.endMin = Math.max(last.endMin, b.endMin);
    } else {
      merged.push({ ...b });
    }
  }

  const gaps: Interval[] = [];
  let cursor = window.startMin;
  for (const b of merged) {
    if (b.startMin > cursor) gaps.push({ startMin: cursor, endMin: b.startMin });
    cursor = Math.max(cursor, b.endMin);
  }
  if (cursor < window.endMin) gaps.push({ startMin: cursor, endMin: window.endMin });

  const slots: number[] = [];
  for (const gap of gaps) {
    for (let start = gap.startMin; start + duration <= gap.endMin; start += duration) {
      if (isToday && start <= nowMin) continue;
      slots.push(start);
    }
  }
  return slots;
}

export function toBusyIntervals(appointments: Pick<Appointment, "startMin" | "endMin" | "status">[]): Interval[] {
  return appointments
    .filter((a) => a.status !== "cancelado")
    .map((a) => ({ startMin: a.startMin, endMin: a.endMin }));
}

/** Convierte las pausas (breaks) que aplican a una fecha dada en intervalos
 * ocupados, para que se descuenten de los horarios disponibles igual que un
 * turno ya tomado. */
export function breaksForDate(breaks: Pick<BusinessBreak, "daysOfWeek" | "startMin" | "endMin" | "active">[], date: Date): Interval[] {
  const weekday = date.getUTCDay();
  return breaks
    .filter((b) => b.active && (b.daysOfWeek.length === 0 || b.daysOfWeek.includes(weekday)))
    .map((b) => ({ startMin: b.startMin, endMin: b.endMin }));
}
