export function formatMoney(pesos: number): string {
  return "$" + pesos.toLocaleString("es-AR");
}

export function minutesToTime(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function dateToKey(d: Date): string {
  // YYYY-MM-DD en UTC — así una fecha "sin hora" no se corre de día por huso horario.
  return d.toISOString().slice(0, 10);
}

export function keyToDate(key: string): Date {
  return new Date(`${key}T00:00:00.000Z`);
}

// El servidor (Vercel) corre en UTC, pero el negocio es en Argentina
// (UTC-3 fijo, sin horario de verano). Cerca de la medianoche UTC (21:00 a
// 23:59 hora Argentina) "new Date()" solo ya cae del lado del día siguiente
// para Argentina — bug reportado por Pablo el 04/09/2026 (disponibilidad de
// horarios, corregido puntualmente en slots.ts) y de nuevo el 05/09/2026
// ("Turnos de hoy" mostraba el sábado siendo todavía viernes a la noche).
// Usar SIEMPRE nowART()/todayKeyART() en vez de "new Date()" cuando se
// necesita el instante o el día calendario de Argentina (ver
// turnos-app-fixes-pendientes.md, punto 23).
export function nowART(): Date {
  return new Date(Date.now() - 3 * 60 * 60_000);
}

export function todayKeyART(): string {
  return dateToKey(nowART());
}

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

export function formatDateHuman(key: string): string {
  const d = keyToDate(key);
  const dia = DIAS[d.getUTCDay()];
  const dd = d.getUTCDate();
  const mes = MESES[d.getUTCMonth()];
  return `${dia} ${dd} de ${mes}`;
}

export function formatDateShort(key: string): string {
  const d = keyToDate(key);
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export const CATEGORY_LABELS: Record<string, string> = {
  facial: "Facial",
  corporal: "Corporal",
  depilacion: "Depilación",
  cejas: "Cejas",
  otro: "Otro",
};

export const STATUS_LABELS: Record<string, string> = {
  confirmado: "Confirmado",
  cancelado: "Cancelado",
  atendido: "Atendido",
  ausente: "Ausente",
};

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia",
  descuento: "Descuento",
};

export const DEPOSIT_STATUS_LABELS: Record<string, string> = {
  no_requerido: "—",
  pendiente: "Seña pendiente",
  pagado: "Seña pagada",
  rechazado: "Revisar comprobante",
};

// Convierte fecha (medianoche UTC, solo importa el día) + minutos desde
// medianoche LOCAL (Argentina, UTC-3 fijo, sin horario de verano) a un
// instante UTC real — lo necesita el bot para calcular "faltan 48hs para el turno".
export function appointmentDateTimeUTC(dateKey: string, startMin: number): Date {
  const [y, m, d] = dateKey.split("-").map(Number);
  const ms = Date.UTC(y, m - 1, d, 0, 0, 0) + startMin * 60_000 + 3 * 60 * 60_000;
  return new Date(ms);
}
