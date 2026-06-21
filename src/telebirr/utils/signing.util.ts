import { createSign, createVerify, constants as cryptoConstants } from 'crypto';

/** Telebirr H5 C2B spec: RSA-PSS with SHA-256 MGF1 and 32-byte salt. */
const TELEBIRR_PSS_SIGN_OPTIONS = {
  padding: cryptoConstants.RSA_PKCS1_PSS_PADDING,
  saltLength: 32,
} as const;

const EXCLUDE_FIELDS = new Set([
  'sign',
  'sign_type',
  'header',
  'refund_info',
  'openType',
  'open_type',
  'raw_request',
  'biz_content',
  'wallet_reference_data',
]);

type FieldMap = Record<string, string | number | boolean>;

/**
 * Telebirr RSA-SHA256 PSS signing (payment.preorder / payment.queryorder).
 * Port of FL.Services.Payment.Telebirr.SigningUtil.
 */
export function signTelebirrRequest(
  request: Record<string, unknown>,
  privateKeyPem: string,
): string {
  const signStr = buildPreorderSignString(request);
  const signer = createSign('RSA-SHA256');
  signer.update(signStr);
  signer.end();
  try {
    return signer.sign(
      { key: privateKeyPem, ...TELEBIRR_PSS_SIGN_OPTIONS },
      'base64',
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Telebirr request signing failed (${msg}). Check TELEBIRR_PRIVATE_KEY_PEM is a complete PKCS#8 PEM.`,
    );
  }
}

export function verifyTelebirrSignature(
  data: string,
  signatureBase64: string,
  publicKeyPem: string,
  padding: 'pss' | 'pkcs1' = 'pss',
): boolean {
  try {
    const verifier = createVerify('RSA-SHA256');
    verifier.update(data);
    verifier.end();
    return verifier.verify(
      {
        key: publicKeyPem,
        padding:
          padding === 'pkcs1'
            ? cryptoConstants.RSA_PKCS1_PADDING
            : cryptoConstants.RSA_PKCS1_PSS_PADDING,
        ...(padding === 'pss' ? { saltLength: 32 } : {}),
      },
      signatureBase64,
      'base64',
    );
  } catch {
    return false;
  }
}

function buildPreorderSignString(request: Record<string, unknown>): string {
  const fieldMap: FieldMap = {};
  const fields: string[] = [];

  for (const [key, value] of Object.entries(request)) {
    if (EXCLUDE_FIELDS.has(key)) continue;
    fields.push(key);
    fieldMap[key] = stringifyValue(value);
  }

  const biz = request.biz_content;
  if (biz && typeof biz === 'object' && !Array.isArray(biz)) {
    for (const [key, value] of Object.entries(biz as Record<string, unknown>)) {
      if (EXCLUDE_FIELDS.has(key)) continue;
      fields.push(key);
      fieldMap[key] = stringifyValue(value);
    }
  }

  fields.sort((a, b) => a.localeCompare(b));

  const pairs = fields.map((key) => `${key}=${fieldMap[key]}`);
  const typeIdx = pairs.findIndex((p) =>
    p.startsWith('payee_identifier_type='),
  );
  const idIdx = pairs.findIndex((p) => p.startsWith('payee_identifier='));
  if (typeIdx >= 0 && idIdx >= 0 && typeIdx < idIdx) {
    [pairs[typeIdx], pairs[idIdx]] = [pairs[idIdx], pairs[typeIdx]];
  }

  return pairs.join('&');
}

function stringifyValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value);
}

const CALLBACK_SIGN_FIELDS: Array<{
  key: string;
  read: (p: TelebirrCallbackPayloadDto) => string;
}> = [
  { key: 'appid', read: (p) => p.appid ?? '' },
  { key: 'merch_code', read: (p) => p.merch_code ?? '' },
  { key: 'merch_order_id', read: (p) => p.merch_order_id ?? '' },
  { key: 'notify_time', read: (p) => p.notify_time ?? '' },
  { key: 'notify_url', read: (p) => p.notify_url ?? '' },
  { key: 'payment_order_id', read: (p) => p.payment_order_id ?? '' },
  { key: 'total_amount', read: (p) => p.total_amount ?? '' },
  { key: 'trade_status', read: (p) => p.trade_status ?? '' },
  { key: 'trans_currency', read: (p) => p.trans_currency ?? '' },
  { key: 'trans_end_time', read: (p) => p.trans_end_time ?? '' },
  { key: 'trans_id', read: (p) => p.trans_id ?? '' },
];

export interface TelebirrCallbackPayloadDto {
  notify_url?: string;
  appid?: string;
  notify_time?: string;
  merch_code?: string;
  merch_order_id?: string;
  payment_order_id?: string;
  total_amount?: string;
  trans_id?: string;
  trans_currency?: string;
  trade_status?: string;
  trans_end_time?: string;
  callback_info?: string;
  sign?: string;
  sign_type?: string;
}

export function buildCallbackSignString(
  payload: TelebirrCallbackPayloadDto,
  options?: { omitEmpty?: boolean; urlEncodeValues?: boolean },
): string {
  const omitEmpty = options?.omitEmpty ?? false;
  const urlEncodeValues = options?.urlEncodeValues ?? false;

  const pairs = CALLBACK_SIGN_FIELDS.map((f) => {
    const value = f.read(payload);
    if (omitEmpty && !value) return null;
    const encoded = urlEncodeValues ? encodeURIComponent(value) : value;
    return `${f.key}=${encoded}`;
  }).filter((p): p is string => p !== null);

  return pairs.join('&');
}

/** Fields signed for H5 paygate checkout (excludes sign_type, version, trade_type). */
const CHECKOUT_SIGN_FIELD_ORDER = [
  'appid',
  'merch_code',
  'nonce_str',
  'prepay_id',
  'timestamp',
] as const;

/**
 * Build the H5 web paygate redirect URL after payment.preorder returns prepay_id.
 * Matches facility-license-be / official Telebirr demo: sign five fields with PSS,
 * url-encode query values, append version and trade_type after the signature block.
 */
export function buildTelebirrCheckoutUrl(params: {
  webBaseUrl: string;
  merchantAppId: string;
  merchantCode: string;
  prepayId: string;
  nonceStr: string;
  timestamp: string;
  privateKeyPem: string;
}): string {
  const checkoutMap: Record<string, string> = {
    appid: params.merchantAppId,
    merch_code: params.merchantCode,
    nonce_str: params.nonceStr,
    prepay_id: params.prepayId,
    timestamp: params.timestamp,
  };

  const sign = signTelebirrRequest(checkoutMap, params.privateKeyPem);

  const urlParams: Record<string, string> = {
    ...checkoutMap,
    sign_type: 'SHA256WithRSA',
    sign,
  };

  const parts: string[] = [];
  for (const key of [
    ...CHECKOUT_SIGN_FIELD_ORDER,
    'sign_type',
    'sign',
  ] as const) {
    parts.push(`${key}=${encodeURIComponent(urlParams[key])}`);
  }

  const base = params.webBaseUrl.endsWith('?')
    ? params.webBaseUrl
    : `${params.webBaseUrl.replace(/\/$/, '')}?`;

  return `${base}${parts.join('&')}&version=1.0&trade_type=Checkout`;
}

export function verifyRedirectCallbackSignature(
  payload: TelebirrCallbackPayloadDto,
  publicKeyPem: string,
): { verified: boolean; variant?: string } {
  if (!publicKeyPem || !payload.sign) {
    return { verified: false };
  }

  const redirectSign = buildCallbackSignString(payload, { omitEmpty: true });
  const redirectSignEnc = buildCallbackSignString(payload, {
    omitEmpty: true,
    urlEncodeValues: true,
  });
  const callbackSign = buildCallbackSignString(payload, { omitEmpty: false });
  const callbackSignEnc = buildCallbackSignString(payload, {
    omitEmpty: false,
    urlEncodeValues: true,
  });

  const attempts: Array<[string, string, 'pss' | 'pkcs1']> = [
    ['redirect+raw+pkcs1', redirectSign, 'pkcs1'],
    ['redirect+raw+pss', redirectSign, 'pss'],
    ['redirect+encoded+pkcs1', redirectSignEnc, 'pkcs1'],
    ['redirect+encoded+pss', redirectSignEnc, 'pss'],
    ['callback+raw+pkcs1', callbackSign, 'pkcs1'],
    ['callback+raw+pss', callbackSign, 'pss'],
    ['callback+encoded+pkcs1', callbackSignEnc, 'pkcs1'],
    ['callback+encoded+pss', callbackSignEnc, 'pss'],
  ];

  for (const [variant, data, padding] of attempts) {
    if (verifyTelebirrSignature(data, payload.sign, publicKeyPem, padding)) {
      return { verified: true, variant };
    }
  }

  return { verified: false };
}
