// Envío/recepción de mensajes vía WhatsApp Cloud API (Meta).
// Requiere WHATSAPP_TOKEN (token permanente de acceso), WHATSAPP_PHONE_NUMBER_ID
// (el número de RB Estética dado de alta en Meta Business) y WHATSAPP_VERIFY_TOKEN
// (string inventado por nosotros, para que Meta verifique el webhook).
//
// Ver claude/bot-whatsapp-turnos.md en el proyecto de Claude para los pasos de
// alta en Meta Business Manager — eso lo tiene que hacer Romina/Pablo, no se
// puede armar desde acá.

const GRAPH_VERSION = "v20.0";

function apiUrl(path: string): string {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!phoneNumberId) throw new Error("Falta WHATSAPP_PHONE_NUMBER_ID en las variables de entorno.");
  return `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}${path}`;
}

function authHeaders(): HeadersInit {
  const token = process.env.WHATSAPP_TOKEN;
  if (!token) throw new Error("Falta WHATSAPP_TOKEN en las variables de entorno.");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

async function callGraph(path: string, body: unknown) {
  const res = await fetch(apiUrl(path), { method: "POST", headers: authHeaders(), body: JSON.stringify(body) });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`WhatsApp API error (${res.status}): ${text}`);
  }
  return res.json();
}

export async function sendWhatsAppText(to: string, body: string) {
  return callGraph("/messages", {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body, preview_url: false },
  });
}

// Aviso interno a Romina (OWNER_WHATSAPP_NUMBER) — nunca rompe el flujo de la
// clienta si falla (por ejemplo si todavía no pasaron 24hs desde que ella le
// escribió al bot y hace falta una plantilla en vez de texto libre).
export async function notifyOwner(message: string) {
  const ownerNumber = process.env.OWNER_WHATSAPP_NUMBER;
  if (!ownerNumber) return;
  try {
    await sendWhatsAppText(ownerNumber, message);
  } catch (e) {
    console.error("No se pudo notificar al dueño:", e);
  }
}

export interface WhatsAppListRow {
  id: string;
  title: string; // máx 24 caracteres (límite de Meta)
  description?: string; // máx 72 caracteres
}

// Mensaje de lista interactiva (ej. elegir servicio, elegir horario). Meta permite
// hasta 10 filas por sección.
export async function sendWhatsAppList(params: {
  to: string;
  bodyText: string;
  buttonText: string; // texto del botón que abre la lista, máx 20 caracteres
  sectionTitle: string;
  rows: WhatsAppListRow[];
}) {
  return callGraph("/messages", {
    messaging_product: "whatsapp",
    to: params.to,
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: params.bodyText },
      action: {
        button: params.buttonText,
        sections: [{ title: params.sectionTitle, rows: params.rows }],
      },
    },
  });
}

export interface WhatsAppButton {
  id: string;
  title: string; // máx 20 caracteres
}

// Mensaje con hasta 3 botones rápidos (ej. "Sí" / "Elegir otro horario").
export async function sendWhatsAppButtons(to: string, bodyText: string, buttons: WhatsAppButton[]) {
  return callGraph("/messages", {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: bodyText },
      action: {
        buttons: buttons.map((b) => ({ type: "reply", reply: { id: b.id, title: b.title } })),
      },
    },
  });
}

// Mensaje de plantilla (template) pre-aprobada por Meta — necesario para mandar
// un mensaje que NO es respuesta a algo que la clienta escribió en las últimas
// 24hs (ej. el recordatorio de preparación). Ver bot-whatsapp-turnos.md para el
// texto exacto de las plantillas a dar de alta.
export async function sendWhatsAppTemplate(params: {
  to: string;
  templateName: string;
  languageCode?: string;
  bodyParams?: string[];
}) {
  return callGraph("/messages", {
    messaging_product: "whatsapp",
    to: params.to,
    type: "template",
    template: {
      name: params.templateName,
      language: { code: params.languageCode || "es_AR" },
      components: params.bodyParams?.length
        ? [{ type: "body", parameters: params.bodyParams.map((text) => ({ type: "text", text })) }]
        : undefined,
    },
  });
}

// Descarga un archivo multimedia que mandó la clienta (ej. foto del comprobante).
// El webhook solo trae un `media id` — hay que resolverlo a una URL temporal y
// después bajar el binario, ambos pasos autenticados con el mismo token.
export async function downloadWhatsAppMedia(mediaId: string): Promise<{ buffer: Buffer; mimeType: string }> {
  const token = process.env.WHATSAPP_TOKEN;
  if (!token) throw new Error("Falta WHATSAPP_TOKEN en las variables de entorno.");

  const metaRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${mediaId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!metaRes.ok) throw new Error(`No se pudo resolver el media id ${mediaId}: ${await metaRes.text()}`);
  const meta = await metaRes.json();

  const fileRes = await fetch(meta.url, { headers: { Authorization: `Bearer ${token}` } });
  if (!fileRes.ok) throw new Error(`No se pudo descargar el archivo de WhatsApp: ${await fileRes.text()}`);
  const arrayBuffer = await fileRes.arrayBuffer();

  return { buffer: Buffer.from(arrayBuffer), mimeType: meta.mime_type || "application/octet-stream" };
}

export async function markWhatsAppMessageRead(messageId: string) {
  return callGraph("/messages", {
    messaging_product: "whatsapp",
    status: "read",
    message_id: messageId,
  });
}
