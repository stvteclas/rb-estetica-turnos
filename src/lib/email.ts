import { BUSINESS } from "@/lib/business";

/**
 * Envío de mails transaccionales (confirmación de turno) usando Resend.
 * Si no está configurado RESEND_API_KEY todavía, no rompe nada: solo no
 * manda el mail (queda un log en la consola de Vercel para detectarlo).
 */

interface SendAppointmentConfirmationParams {
  to: string;
  clientName: string;
  serviceName: string;
  dateLabel: string; // ya formateada, ej "viernes 4 de septiembre"
  timeLabel: string; // ej "14:30"
  price?: number | null;
}

export async function sendAppointmentConfirmationEmail(params: SendAppointmentConfirmationParams) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey || !from) {
    console.warn("[email] RESEND_API_KEY o EMAIL_FROM no configurados, no se envía mail de confirmación.");
    return { ok: false as const, skipped: true as const };
  }

  const { clientName, serviceName, dateLabel, timeLabel, price, to } = params;

  const priceLine = price != null ? `<p><strong>Precio:</strong> $${price.toLocaleString("es-AR")}</p>` : "";

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #2b2320;">
      <h2 style="color: #a8674f;">¡Turno confirmado! 🤍</h2>
      <p>Hola ${clientName}, tu turno en <strong>${BUSINESS.name}</strong> quedó reservado:</p>
      <p><strong>Tratamiento:</strong> ${serviceName}</p>
      <p><strong>Fecha:</strong> ${dateLabel}</p>
      <p><strong>Hora:</strong> ${timeLabel}</p>
      ${priceLine}
      <p style="margin-top: 20px;">Dirección: ${BUSINESS.address}</p>
      <p>Cualquier consulta, escribinos por WhatsApp: <a href="${BUSINESS.whatsappLink}">${BUSINESS.whatsapp}</a></p>
      <p style="margin-top: 24px; color: #8a7d75; font-size: 13px;">${BUSINESS.name}</p>
    </div>
  `;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to,
        subject: `Turno confirmado - ${BUSINESS.name}`,
        html,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("[email] Error al enviar confirmación:", res.status, errText);
      return { ok: false as const, skipped: false as const };
    }

    return { ok: true as const, skipped: false as const };
  } catch (err) {
    console.error("[email] Excepción al enviar confirmación:", err);
    return { ok: false as const, skipped: false as const };
  }
}
