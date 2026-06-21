/** Telebirr fabric token API returns `Bearer <token>` — avoid `Bearer Bearer …`. */
export function normalizeFabricAuthHeader(token: string): string {
  const trimmed = token.trim();
  if (/^Bearer\s+/i.test(trimmed)) {
    return trimmed;
  }
  return `Bearer ${trimmed}`;
}
