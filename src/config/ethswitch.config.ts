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
  }),
);
