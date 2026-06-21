import { registerAs } from '@nestjs/config';

export interface PaymentConfig {
  paymentSuccessWebhookUrl: string;
  serviceApiKey: string;
}

export default registerAs(
  'payment',
  (): PaymentConfig => ({
    paymentSuccessWebhookUrl: (
      process.env.PAYMENT_SUCCESS_WEBHOOK_URL ?? ''
    ).trim(),
    serviceApiKey: (process.env.SERVICE_API_KEY ?? '').trim(),
  }),
);
