import { OrderResponseDto } from '../dto/ethswitch.dto';

/** NGB gateway JSON uses snake_case; map to internal camelCase DTO fields. */
export function normalizeOrderResponse(
  raw: Record<string, unknown> | OrderResponseDto | null | undefined,
): OrderResponseDto {
  if (!raw || typeof raw !== 'object') return {};

  const r = raw as Record<string, unknown>;
  return {
    orderReference: pickString(r, 'orderReference', 'order_reference'),
    hppUrl: pickString(r, 'hppUrl', 'hpp_url'),
    hppToken: pickString(r, 'hppToken', 'hpp_token'),
    expiresAt: pickString(r, 'expiresAt', 'expires_at'),
    billerName: pickString(r, 'billerName', 'biller_name'),
    merchantOrderNumber: pickString(
      r,
      'merchantOrderNumber',
      'merchant_order_number',
    ),
    amount: pickNumber(r, 'amount'),
    currency: pickString(r, 'currency'),
  };
}

function pickString(
  obj: Record<string, unknown>,
  ...keys: string[]
): string | undefined {
  for (const key of keys) {
    const val = obj[key];
    if (typeof val === 'string' && val.trim()) return val;
  }
  return undefined;
}

function pickNumber(
  obj: Record<string, unknown>,
  key: string,
): number | undefined {
  const val = obj[key];
  if (typeof val === 'number') return val;
  if (typeof val === 'string' && val.trim()) {
    const n = Number(val);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}
