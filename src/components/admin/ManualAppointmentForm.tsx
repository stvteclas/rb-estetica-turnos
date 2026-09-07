"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { getAvailableDateKeys, getAvailability } from "@/lib/actions/public";
import { searchClients } from "@/lib/actions/admin";
import { formatDateHuman, minutesToTime } from "@/lib/format";

type KnownClient = { id: string; name: string; phone: string; email: string | null };

export default function ManualAppointmentForm({
  action,
  selectedKey,
  services,
}: {
  action: (formData: FormData) => Promise<void> | void;
  selectedKey: string;
  services: { id: string; name: string; duration: number }[];
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();

  // Pedido de Romina (Google Form, 05/09/2026): que le figuren las fechas y
  // horarios disponibles al cargar un turno, en vez de tener que revisar la
  // grilla a mano. Reusa getAvailableDateKeys/getAvailability (ya existían
  // para la reserva pública, ver BookingWizard.tsx) — mismo criterio de
  // disponibilidad (horario del servicio, Agenda de fechas puntuales,
  // turnos ya tomados).
  const [serviceId, setServiceId] = useState("");
  const [manualMode, setManualMode] = useState(false);
  const [availableDates, setAvailableDates] = useState<string[] | null>(null);
  const [loadingDates, setLoadingDates] = useState(false);
  const [dateKey, setDateKey] = useState("");
  const [slots, setSlots] = useState<number[] | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);

  // Pedido de Romina (07/09/2026): listar clientas conocidas o cargar una nueva.
  const [clientMode, setClientMode] = useState<"pick" | "new">("pick");
  const [selectedClient, setSelectedClient] = useState<KnownClient | null>(null);
  const [clientQuery, setClientQuery] = useState("");
  const [clientResults, setClientResults] = useState<KnownClient[]>([]);
  const [loadingClients, setLoadingClients] = useState(false);

  async function onServiceChange(id: string) {
    setServiceId(id);
    setDateKey("");
    setSlots(null);
    setAvailableDates(null);
    if (!id) return;
    setLoadingDates(true);
    const keys = await getAvailableDateKeys(id);
    setLoadingDates(false);
    setAvailableDates(keys);
  }

  async function onDateChange(key: string) {
    setDateKey(key);
    setSlots(null);
    if (!key || !serviceId) return;
    setLoadingSlots(true);
    const res = await getAvailability(serviceId, key);
    setLoadingSlots(false);
    setSlots(res.ok ? res.slots : []);
  }

  function resetClientPicker() {
    setClientMode("pick");
    setSelectedClient(null);
    setClientQuery("");
  }

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      await action(formData);
      formRef.current?.reset();
      setServiceId("");
      setDateKey("");
      setSlots(null);
      setAvailableDates(null);
      resetClientPicker();
      if (detailsRef.current) {
        detailsRef.current.open = false;
      }
    });
  }

  useEffect(() => {
    if (clientMode !== "pick" || selectedClient) return;
    const handle = window.setTimeout(async () => {
      setLoadingClients(true);
      const rows = await searchClients(clientQuery);
      setClientResults(rows);
      setLoadingClients(false);
    }, clientQuery ? 200 : 0);
    return () => window.clearTimeout(handle);
  }, [clientQuery, clientMode, selectedClient]);

  return (
    <details ref={detailsRef} className="edit-row card pad" style={{ marginBottom: 24 }}>
      <summary>+ Cargar turno manual</summary>
      <form
        ref={formRef}
        action={handleSubmit}
        className="grid"
        style={{ gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}
      >
        <div className="field" style={{ gridColumn: "1 / -1" }}>
          <label>Servicio</label>
          <select
            name="serviceId"
            required
            value={serviceId}
            onChange={(e) => onServiceChange(e.target.value)}
          >
            <option value="" disabled>Elegí un servicio…</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>{s.name} ({s.duration} min)</option>
            ))}
          </select>
        </div>

        {!manualMode && (
          <>
            <div className="field">
              <label>Fecha (solo se muestran fechas con disponibilidad real)</label>
              <select
                name="date"
                required
                value={dateKey}
                disabled={!serviceId || loadingDates}
                onChange={(e) => onDateChange(e.target.value)}
              >
                <option value="" disabled>
                  {!serviceId ? "Elegí un servicio primero" : loadingDates ? "Buscando fechas disponibles…" : "Elegí una fecha…"}
                </option>
                {availableDates?.map((key) => (
                  <option key={key} value={key}>{formatDateHuman(key)}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Hora (solo horarios libres ese día)</label>
              <select
                name="startTime"
                required
                disabled={!dateKey || loadingSlots}
                defaultValue=""
              >
                <option value="" disabled>
                  {!dateKey ? "Elegí una fecha primero" : loadingSlots ? "Buscando horarios…" : "Elegí un horario…"}
                </option>
                {slots?.map((m) => (
                  <option key={m} value={minutesToTime(m)}>{minutesToTime(m)}</option>
                ))}
              </select>
              {!loadingSlots && dateKey && slots?.length === 0 && (
                <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                  No hay horarios libres ese día para este servicio.
                </p>
              )}
            </div>
          </>
        )}
        {manualMode && (
          <>
            <div className="field">
              <label>Fecha</label>
              <input type="date" name="date" defaultValue={selectedKey} required />
            </div>
            <div className="field">
              <label>Hora</label>
              <input type="time" name="startTime" required />
            </div>
          </>
        )}
        <div style={{ gridColumn: "1 / -1", marginTop: -4 }}>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setManualMode((v) => !v)}
          >
            {manualMode ? "Volver a fechas/horarios sugeridos" : "Cargar fecha/hora fuera de lo sugerido"}
          </button>
        </div>

        <div className="field" style={{ gridColumn: "1 / -1", marginBottom: 0 }}>
          <label>Clienta</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
            <button
              type="button"
              className={`btn btn-sm ${clientMode === "pick" ? "btn-primary" : "btn-ghost"}`}
              onClick={() => {
                setClientMode("pick");
                setSelectedClient(null);
              }}
            >
              Clienta conocida
            </button>
            <button
              type="button"
              className={`btn btn-sm ${clientMode === "new" ? "btn-primary" : "btn-ghost"}`}
              onClick={() => {
                setClientMode("new");
                setSelectedClient(null);
                setClientQuery("");
              }}
            >
              Clienta nueva
            </button>
          </div>
        </div>

        {clientMode === "pick" && selectedClient && (
          <div className="card pad" style={{ gridColumn: "1 / -1", marginBottom: 8 }}>
            <input type="hidden" name="clientId" value={selectedClient.id} />
            <input type="hidden" name="name" value={selectedClient.name} />
            <input type="hidden" name="phone" value={selectedClient.phone} />
            <input type="hidden" name="email" value={selectedClient.email || ""} />
            <div style={{ fontWeight: 600 }}>{selectedClient.name}</div>
            <div className="muted" style={{ fontSize: 13 }}>{selectedClient.phone}{selectedClient.email ? ` · ${selectedClient.email}` : ""}</div>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ marginTop: 8 }}
              onClick={() => setSelectedClient(null)}
            >
              Elegir otra
            </button>
          </div>
        )}

        {clientMode === "pick" && !selectedClient && (
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <input
              type="search"
              value={clientQuery}
              onChange={(e) => setClientQuery(e.target.value)}
              placeholder="Buscar por nombre o teléfono…"
              autoComplete="off"
            />
            <p className="muted" style={{ fontSize: 12, margin: "4px 0 0" }}>
              Se listan las primeras coincidencias. Escribí para filtrar.
            </p>
            <div
              style={{
                maxHeight: 220,
                overflowY: "auto",
                border: "1px solid var(--border)",
                borderRadius: 10,
                background: "var(--surface)",
              }}
            >
              {loadingClients && (
                <p className="muted" style={{ padding: "10px 13px", margin: 0, fontSize: 13 }}>Buscando clientas…</p>
              )}
              {!loadingClients && clientResults.length === 0 && (
                <p className="muted" style={{ padding: "10px 13px", margin: 0, fontSize: 13 }}>
                  {clientQuery ? "No hay clientas con ese nombre o teléfono." : "No hay clientas cargadas todavía."}
                </p>
              )}
              {!loadingClients && clientResults.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedClient(c)}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "10px 13px",
                    border: "none",
                    borderBottom: "1px solid var(--border)",
                    background: "transparent",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    fontSize: 14,
                    color: "var(--text)",
                  }}
                >
                  <span style={{ fontWeight: 600, pointerEvents: "none" }}>{c.name}</span>
                  <span className="muted" style={{ marginLeft: 8, pointerEvents: "none" }}>{c.phone}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {clientMode === "new" && (
          <>
            <div className="field">
              <label>Nombre de la clienta</label>
              <input name="name" required />
            </div>
            <div className="field">
              <label>Teléfono</label>
              <input name="phone" required />
            </div>
            <div className="field">
              <label>Email (opcional)</label>
              <input type="email" name="email" />
            </div>
          </>
        )}
        <div className="field" style={{ gridColumn: "1 / -1" }}>
          <label>Notas</label>
          <textarea name="notes" rows={2} />
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <button
            className="btn btn-primary btn-sm"
            type="submit"
            disabled={isPending || (clientMode === "pick" && !selectedClient)}
          >
            {isPending ? "Cargando..." : "Cargar turno"}
          </button>
        </div>
      </form>
    </details>
  );
}
