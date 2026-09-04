"use client";

import { useMemo, useState, useTransition } from "react";
import { getAvailability, createBooking, getAvailableDateKeys } from "@/lib/actions/public";
import {
  CATEGORY_LABELS,
  formatDateHuman,
  formatMoney,
  minutesToTime,
} from "@/lib/format";
import { BUSINESS } from "@/lib/business";

interface ServiceVM {
  id: string;
  name: string;
  category: string;
  price: number;
  packPrice: number | null;
  packSessions: number | null;
  duration: number;
  description: string | null;
}

type Step = "service" | "date" | "time" | "details" | "done";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function nextDays(n: number) {
  const out: { key: string; dow: number; dayNum: number; monthLabel: string; dayLabel: string }[] = [];
  const base = new Date();
  const dayNames = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
  const monthNames = [
    "ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic",
  ];
  for (let i = 0; i < n; i++) {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
    out.push({
      key: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
      dow: d.getDay(),
      dayNum: d.getDate(),
      monthLabel: monthNames[d.getMonth()],
      dayLabel: dayNames[d.getDay()],
    });
  }
  return out;
}

export default function BookingWizard({ services }: { services: ServiceVM[] }) {
  const [step, setStep] = useState<Step>("service");
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [dateKey, setDateKey] = useState<string | null>(null);
  const [startMin, setStartMin] = useState<number | null>(null);
  const [slots, setSlots] = useState<number[] | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [availableDateKeys, setAvailableDateKeys] = useState<string[] | null>(null);
  const [loadingDates, setLoadingDates] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Hasta cuántos días adelante se pueden ver fechas para reservar — igual
  // ventana que usa la Agenda de servicios en /admin (10 semanas), así una
  // fecha que Romina confirmó ahí (ej. un sábado de octubre) aparece acá.
  const days = useMemo(() => nextDays(70), []);
  const service = services.find((s) => s.id === serviceId) || null;

  // Solo mostramos, en el selector de día, las fechas en las que el
  // tratamiento elegido realmente atiende (respeta horario por día y, si
  // tiene Agenda, solo las fechas puntuales que Romina confirmó) — así no
  // aparece, por ejemplo, un miércoles para un servicio que solo atiende
  // viernes y sábados.
  async function loadAvailableDates(id: string) {
    setAvailableDateKeys(null);
    setLoadingDates(true);
    const keys = await getAvailableDateKeys(id);
    setLoadingDates(false);
    setAvailableDateKeys(keys);
  }

  const visibleDays = availableDateKeys ? days.filter((d) => availableDateKeys.includes(d.key)) : [];

  async function pickDate(key: string) {
    setDateKey(key);
    setStartMin(null);
    setError(null);
    setLoadingSlots(true);
    setStep("time");
    const res = await getAvailability(serviceId!, key);
    setLoadingSlots(false);
    if (!res.ok) {
      setError(res.error);
      setSlots([]);
      return;
    }
    setSlots(res.slots);
  }

  async function confirm() {
    setError(null);
    if (!serviceId || !dateKey || startMin == null) return;
    startTransition(async () => {
      const res = await createBooking({
        serviceId,
        dateKey,
        startMin,
        name,
        phone,
        email,
        notes,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setStep("done");
    });
  }

  function reset() {
    setStep("service");
    setServiceId(null);
    setDateKey(null);
    setStartMin(null);
    setSlots(null);
    setAvailableDateKeys(null);
    setLoadingDates(false);
    setName("");
    setPhone("");
    setEmail("");
    setNotes("");
    setError(null);
  }

  const stepIndex = { service: 0, date: 1, time: 2, details: 3, done: 4 }[step];

  return (
    <div>
      {step !== "done" && (
        <div style={{ display: "flex", gap: 6, marginBottom: 24 }}>
          {["Tratamiento", "Día", "Horario", "Tus datos"].map((label, i) => (
            <div
              key={label}
              style={{
                flex: 1,
                textAlign: "center",
                fontSize: 12,
                fontWeight: 600,
                color: i <= stepIndex ? "var(--accent)" : "var(--text-soft)",
                opacity: i <= stepIndex ? 1 : 0.5,
              }}
            >
              <div
                style={{
                  height: 4,
                  borderRadius: 2,
                  background: i <= stepIndex ? "var(--accent)" : "var(--border)",
                  marginBottom: 6,
                }}
              />
              {label}
            </div>
          ))}
        </div>
      )}

      {step === "service" && (
        <div className="grid" style={{ gridTemplateColumns: "1fr", gap: 12 }}>
          {services.length === 0 && (
            <p className="muted">Por el momento no hay tratamientos disponibles para reservar online.</p>
          )}
          {services.map((s) => (
            <button
              key={s.id}
              className="card pad"
              style={{ textAlign: "left", cursor: "pointer", border: "1px solid var(--border)" }}
              onClick={() => {
                setServiceId(s.id);
                setStep("date");
                loadAvailableDates(s.id);
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                <div>
                  <span className={`pill pill-${s.category}`}>{CATEGORY_LABELS[s.category] || s.category}</span>
                  <h3 style={{ fontSize: 19, marginTop: 8 }}>{s.name}</h3>
                  {s.description && <p className="muted" style={{ marginTop: 6 }}>{s.description}</p>}
                  <p className="muted" style={{ marginTop: 6 }}>Duración aprox.: {s.duration} min</p>
                </div>
                <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  <div style={{ fontWeight: 700, fontSize: 17 }}>{formatMoney(s.price)}</div>
                  {s.packPrice && s.packSessions && (
                    <div className="muted" style={{ fontSize: 12 }}>
                      Pack {s.packSessions} ses. {formatMoney(s.packPrice)}
                    </div>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {step === "date" && service && (
        <div>
          <BackLink onClick={() => setStep("service")} label="Cambiar tratamiento" />
          <h2 style={{ fontSize: 20, margin: "16px 0" }}>¿Qué día te queda mejor?</h2>
          {loadingDates && <p className="muted">Buscando días disponibles…</p>}
          {!loadingDates && visibleDays.length === 0 && (
            <p className="muted">No encontramos fechas disponibles para este tratamiento en los próximos días. Escribinos por WhatsApp y te ayudamos a mano.</p>
          )}
          {!loadingDates && visibleDays.length > 0 && (
            <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 8 }}>
              {visibleDays.map((d) => (
                <button
                  key={d.key}
                  className="btn btn-ghost"
                  style={{ flexDirection: "column", minWidth: 64, padding: "10px 8px" }}
                  onClick={() => pickDate(d.key)}
                >
                  <span style={{ fontSize: 11, textTransform: "uppercase", color: "var(--text-soft)" }}>
                    {d.dayLabel}
                  </span>
                  <span style={{ fontSize: 18, fontWeight: 700 }}>{d.dayNum}</span>
                  <span style={{ fontSize: 11, color: "var(--text-soft)" }}>{d.monthLabel}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {step === "time" && service && dateKey && (
        <div>
          <BackLink onClick={() => setStep("date")} label="Cambiar día" />
          <h2 style={{ fontSize: 20, margin: "16px 0" }}>
            {service.name} — {formatDateHuman(dateKey)}
          </h2>
          {loadingSlots && <p className="muted">Buscando horarios disponibles…</p>}
          {!loadingSlots && slots && slots.length === 0 && (
            <p className="muted">No hay horarios disponibles ese día. Probá con otra fecha.</p>
          )}
          {!loadingSlots && slots && slots.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {slots.map((m) => (
                <button
                  key={m}
                  className="pill"
                  style={{
                    fontSize: 15,
                    padding: "10px 18px",
                    background: "var(--blush)",
                    color: "var(--text)",
                    border: "1px solid var(--border)",
                    cursor: "pointer",
                  }}
                  onClick={() => {
                    setStartMin(m);
                    setStep("details");
                  }}
                >
                  {minutesToTime(m)}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {step === "details" && service && dateKey && startMin != null && (
        <div>
          <BackLink onClick={() => setStep("time")} label="Cambiar horario" />
          <div className="card pad" style={{ margin: "16px 0" }}>
            <p style={{ fontWeight: 600 }}>{service.name}</p>
            <p className="muted">
              {formatDateHuman(dateKey)} a las {minutesToTime(startMin)} · {formatMoney(service.price)}
            </p>
          </div>
          <div className="field">
            <label>Nombre y apellido</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tu nombre" />
          </div>
          <div className="field">
            <label>WhatsApp</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Ej: 3543 123456"
              inputMode="tel"
            />
          </div>
          <div className="field">
            <label>Email (opcional, para mandarte la confirmación)</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@email.com"
            />
          </div>
          <div className="field">
            <label>Notas (opcional)</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>
          {error && <div className="error-box" style={{ marginBottom: 16 }}>{error}</div>}
          <button className="btn btn-primary" disabled={isPending} onClick={confirm} style={{ width: "100%" }}>
            {isPending ? "Confirmando…" : "Confirmar turno"}
          </button>
        </div>
      )}

      {step === "done" && service && dateKey && startMin != null && (
        <div className="card pad" style={{ textAlign: "center" }}>
          <h2 style={{ fontSize: 22, marginBottom: 12 }}>¡Turno confirmado! 🤍</h2>
          <p>
            {service.name}
            <br />
            {formatDateHuman(dateKey)} a las {minutesToTime(startMin)}
          </p>
          <p className="muted" style={{ marginTop: 12 }}>
            Cualquier consulta, escribinos por WhatsApp al {BUSINESS.whatsapp}.
          </p>
          <button className="btn btn-ghost" style={{ marginTop: 20 }} onClick={reset}>
            Reservar otro turno
          </button>
        </div>
      )}
    </div>
  );
}

function BackLink({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      style={{ background: "none", border: "none", padding: 0, color: "var(--accent)", cursor: "pointer", fontSize: 13, fontWeight: 600 }}
    >
      ← {label}
    </button>
  );
}
