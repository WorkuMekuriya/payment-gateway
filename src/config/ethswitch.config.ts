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
  paymentSuccessWebhookUrl: string;
  serviceApiKey: string;
}

export default registerAs(
  'ethswitch',
  (): EthSwitchConfig => ({
    baseUrl: (process.env.ETHSWITCH_BASE_URL ?? '').trim(),
    username: (process.env.ETHSWITCH_USERNAME ?? '').trim(),
    password: (process.env.ETHSWITCH_PASSWORD ?? '').trim(),
    billerBin: (process.env.ETHSWITCH_BILLER_BIN ?? '').trim(),
    currency: process.env.ETHSWITCH_CURRENCY ?? 'ETB',
    frontendBaseUrl: process.env.ETHSWITCH_FRONTEND_BASE_URL ?? '',
    cancelUrl: process.env.ETHSWITCH_CANCEL_URL ?? '',
    notifyUrl: process.env.ETHSWITCH_NOTIFY_URL ?? '',
    timeoutExpress: process.env.ETHSWITCH_TIMEOUT_EXPRESS ?? '120m',
    paymentSuccessWebhookUrl: process.env.PAYMENT_SUCCESS_WEBHOOK_URL ?? '',
    serviceApiKey: process.env.SERVICE_API_KEY ?? '',
  }),
);
