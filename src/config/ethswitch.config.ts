import { registerAs } from '@nestjs/config';

export interface EthSwitchConfig {
  baseUrl: string;
  username: string;
  password: string;
  billerBin: string;
  currency: string;
  frontendBaseUrl: string;
  cancelUrl: string;
  notifyUrl: string;
  timeoutExpress: string;
  /** HMAC secret for callback signature verification (x-ethswitch-signature). */
  callbackSecret: string;
  /** Comma-separated source IPs allowed to POST callbacks. */
  allowedIps: string[];
  /** HTTP Basic Auth username for callback endpoint. */
  callbackUsername: string;
  /** HTTP Basic Auth password for callback endpoint. */
  callbackPassword: string;
}

export default registerAs(
  'ethswitch',
  (): EthSwitchConfig => ({
    baseUrl: (process.env.ETHSWITCH_BASE_URL ?? '').trim(),
    username: (process.env.ETHSWITCH_USERNAME ?? '').trim(),
    password: (process.env.ETHSWITCH_PASSWORD ?? '').trim(),
    billerBin: (process.env.ETHSWITCH_BILLER_BIN ?? '').trim(),
    currency: process.env.ETHSWITCH_CURRENCY?.trim() || 'ETB',
    frontendBaseUrl: (process.env.ETHSWITCH_FRONTEND_BASE_URL ?? '').trim(),
    cancelUrl: (process.env.ETHSWITCH_CANCEL_URL ?? '').trim(),
    notifyUrl: (process.env.ETHSWITCH_NOTIFY_URL ?? '').trim(),
    timeoutExpress: process.env.ETHSWITCH_TIMEOUT_EXPRESS?.trim() || '120m',
    callbackSecret: (process.env.ETHSWITCH_CALLBACK_SECRET ?? '').trim(),
    allowedIps: (process.env.ETHSWITCH_ALLOWED_IPS ?? '')
      .split(',')
      .map((ip) => ip.trim())
      .filter(Boolean),
    callbackUsername: (
      process.env.ETHSWITCH_CALLBACK_USERNAME ?? ''
    ).trim(),
    callbackPassword: (
      process.env.ETHSWITCH_CALLBACK_PASSWORD ?? ''
    ).trim(),
  }),
);
