/** Records an anonymous parent pack-size confirmation for a GTIN. Does not identify the device. */
export async function confirmPackSize(ean: string, quantity: string): Promise<void> {
  const origin = import.meta.env.VITE_API_ORIGIN ?? "";
  if (!origin || !ean || !quantity.trim()) return;
  try {
    await fetch(`${origin.replace(/\/$/, "")}/api/products/pack`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ean, quantity: quantity.trim().slice(0, 24) }),
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
  } catch {
    /* offline: local item already updated */
  }
}
