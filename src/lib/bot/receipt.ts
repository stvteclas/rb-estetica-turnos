// Lee la foto del comprobante de transferencia con Claude (visión) y decide si
// coincide con lo esperado (monto y alias/CBU de destino). Automático, sin
// intervención humana en el momento — por eso, ante cualquier duda, el resultado
// es "no coincide" en vez de forzar un match dudoso: es preferible pedirle a la
// clienta un comprobante más claro (o derivar a Romina/Pablo) antes que confirmar
// mal un turno.
//
// Requiere ANTHROPIC_API_KEY en las variables de entorno.

import Anthropic from "@anthropic-ai/sdk";

export interface ReceiptCheckResult {
  matches: boolean;
  extractedAmount: number | null;
  extractedDestination: string | null;
  reason: string; // explicación corta, para loguear o mostrarle a Romina/Pablo si hay que revisar
}

export async function verifyDepositReceipt(params: {
  imageBuffer: Buffer;
  mimeType: string;
  expectedAmount: number;
  expectedAlias: string;
  expectedAccountHolder?: string;
}): Promise<ReceiptCheckResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      matches: false,
      extractedAmount: null,
      extractedDestination: null,
      reason: "Falta ANTHROPIC_API_KEY — no se pudo analizar el comprobante automáticamente.",
    };
  }

  const client = new Anthropic({ apiKey });
  const base64 = params.imageBuffer.toString("base64");
  const isPdf = params.mimeType === "application/pdf";

  const holderLine = params.expectedAccountHolder
    ? `\n- Nombre del titular de la cuenta de destino esperado: "${params.expectedAccountHolder}"`
    : "";

  const prompt = `Este archivo es un comprobante de transferencia bancaria o pago (Mercado Pago, home banking, etc.) que una clienta mandó para pagar una seña.

Datos esperados:
- Monto esperado: $${params.expectedAmount} (pesos argentinos)
- Alias de destino esperado: "${params.expectedAlias}"${holderLine}

El comprobante puede mostrar el destino de distintas formas: a veces aparece el alias tal cual, a veces solo aparece el CBU y el nombre del titular de la cuenta (sin el alias). Dalo por válido si CUALQUIERA de estas coincide razonablemente:
- El alias mostrado coincide con "${params.expectedAlias}".
- El nombre del titular de la cuenta de destino coincide razonablemente con "${params.expectedAccountHolder || params.expectedAlias}" (aunque el comprobante no muestre el alias en sí — el nombre del titular alcanza).

Fijate también si el monto transferido es igual o mayor a $${params.expectedAmount}, y si la imagen es realmente un comprobante de pago/transferencia (no otra cosa).

Respondé SOLO con un JSON válido, sin texto adicional, con este formato exacto:
{"matches": true|false, "extractedAmount": <número o null>, "extractedDestination": "<texto o null>", "reason": "<explicación breve en español, 1 frase>"}`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 400,
    messages: [
      {
        role: "user",
        content: [
          isPdf
            ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } }
            : { type: "image", source: { type: "base64", media_type: params.mimeType as any, data: base64 } },
          { type: "text", text: prompt },
        ] as any,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  const raw = textBlock && "text" in textBlock ? textBlock.text : "";

  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
    return {
      matches: Boolean(parsed.matches),
      extractedAmount: typeof parsed.extractedAmount === "number" ? parsed.extractedAmount : null,
      extractedDestination: parsed.extractedDestination ?? null,
      reason: parsed.reason || "Sin detalle.",
    };
  } catch {
    return {
      matches: false,
      extractedAmount: null,
      extractedDestination: null,
      reason: "No se pudo interpretar la respuesta del análisis — se deja para revisión manual.",
    };
  }
}
