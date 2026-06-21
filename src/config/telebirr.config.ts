import { registerAs } from '@nestjs/config';
import { readFileSync } from 'fs';
import {
  assertPrivateKeyPem,
  assertPublicKeyPem,
  loadPem,
} from '../common/utils/pem.util';

export interface TelebirrConfig {
  baseUrl: string;
  webBaseUrl: string;
  fabricAppId: string;
  appSecret: string;
  merchantAppId: string;
  merchantCode: string;
  privateKeyPem: string;
  telebirrPublicKey: string;
  notifyUrl: string;
  redirectBaseUrl: string;
  timeoutExpress: string;
  queryMaxRetries: number;
  reconcileIntervalMinutes: number;
  allowDevSignatureBypass: boolean;
  /** Dev sandbox only: skip TLS cert verification for Telebirr API host. */
  allowInsecureTls: boolean;
}

function loadPemFromEnv(
  inlineVar: string | undefined,
  pathVar: string | undefined,
  envName: string,
): string {
  const path = (pathVar ?? '').trim();
  if (path) {
    return loadPem(readFileSync(path, 'utf8'));
  }
  return loadPem(inlineVar);
}

export default registerAs(
  'telebirr',
  (): TelebirrConfig => {
    const privateKeyPem = loadPemFromEnv(
      process.env.TELEBIRR_PRIVATE_KEY_PEM,
      process.env.TELEBIRR_PRIVATE_KEY_PATH,
      'TELEBIRR_PRIVATE_KEY_PEM',
    );
    const telebirrPublicKey = loadPemFromEnv(
      process.env.TELEBIRR_PUBLIC_KEY_PEM,
      process.env.TELEBIRR_PUBLIC_KEY_PATH,
      'TELEBIRR_PUBLIC_KEY_PEM',
    );

    const fabricAppId = (process.env.TELEBIRR_FABRIC_APP_ID ?? '').trim();

    if (fabricAppId) {
      assertPrivateKeyPem(privateKeyPem);
      assertPublicKeyPem(telebirrPublicKey);
    }

    return {
    baseUrl: (process.env.TELEBIRR_BASE_URL ?? '').trim(),
    webBaseUrl: (process.env.TELEBIRR_WEB_BASE_URL ?? '').trim(),
    fabricAppId,
    appSecret: (process.env.TELEBIRR_APP_SECRET ?? '').trim(),
    merchantAppId: (process.env.TELEBIRR_MERCHANT_APP_ID ?? '').trim(),
    merchantCode: (process.env.TELEBIRR_MERCHANT_CODE ?? '').trim(),
    privateKeyPem,
    telebirrPublicKey,
    notifyUrl: (process.env.TELEBIRR_NOTIFY_URL ?? '').trim(),
    redirectBaseUrl: (process.env.TELEBIRR_REDIRECT_BASE_URL ?? '').trim(),
    timeoutExpress: process.env.TELEBIRR_TIMEOUT_EXPRESS?.trim() || '120m',
    queryMaxRetries: parseInt(
      process.env.TELEBIRR_QUERY_MAX_RETRIES ?? '3',
      10,
    ),
    reconcileIntervalMinutes: parseInt(
      process.env.TELEBIRR_RECONCILE_INTERVAL_MINUTES ?? '15',
      10,
    ),
    allowDevSignatureBypass:
      process.env.NODE_ENV !== 'production' &&
      process.env.TELEBIRR_ALLOW_DEV_SIGNATURE_BYPASS === 'true',
    allowInsecureTls:
      process.env.NODE_ENV !== 'production' &&
      process.env.TELEBIRR_ALLOW_INSECURE_TLS === 'true',
    };
  },
);
