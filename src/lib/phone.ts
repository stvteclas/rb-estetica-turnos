// Normalización de teléfonos argentinos para poder matchear clientas
// entre reservas online, carga manual del admin, y la importación desde
// tuturno.io — todas deben terminar guardando el mismo formato en la DB.
//
// Guardamos el número "bare": solo dígitos, sin "+", sin código de país (54)
// y sin el "9" de celular argentino. Ej: "+54 9 351 555-1234" -> "3515551234"

export function normalizePhone(raw: string): string {
  let digits = String(raw || "").replace(/\D/g, "");

  // Código de país Argentina
  if (digits.startsWith("549")) {
    digits = digits.slice(3);
  } else if (digits.startsWith("54")) {
    digits = digits.slice(2);
  } else if (digits.startsWith("0")) {
    // algunos formatos locales arrancan con 0 (característica de área)
    digits = digits.slice(1);
  }

  // Si después de sacar el código de país quedó un 9 suelto adelante
  // (celular sin código de país pero con el 9), lo sacamos también,
  // salvo que el número sea muy corto (evitamos comernos un dígito real).
  if (digits.startsWith("9") && digits.length > 10) {
    digits = digits.slice(1);
  }

  return digits;
}

// Para armar links de WhatsApp (wa.me) necesitamos el formato internacional
// completo: 54 9 + número local (celular argentino).
export function toWhatsAppNumber(normalizedPhone: string): string {
  return `549${normalizedPhone}`;
}
