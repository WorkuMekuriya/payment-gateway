import { HttpService } from '@nestjs/axios';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import paymentConfig from '../config/payment.config';
import { PaymentSuccessWebhookDto } from './dto/payment.dto';

@Injectable()
export class PaymentWebhookService {
  private readonly logger = new Logger(PaymentWebhookService.name);

  constructor(
    private readonly http: HttpService,
    @Inject(paymentConfig.KEY)
    private readonly config: ConfigType<typeof paymentConfig>,
  ) {}

  async notifyPaymentSuccess(payload: PaymentSuccessWebhookDto): Promise<void> {
    const url = this.config.paymentSuccessWebhookUrl;
    if (!url) {
      this.logger.warn(
        `PAYMENT_SUCCESS_WEBHOOK_URL not configured; skipping ${payload.provider} payment-success for ${payload.merchOrderId}`,
      );
      return;
    }

    try {
      await firstValueFrom(this.http.post(url, payload));
      this.logger.log(
        `${payload.provider} payment success webhook delivered for AppId=${payload.applicationId}, MerchOrderId=${payload.merchOrderId}`,
      );
    } catch (err) {
      this.logger.error(
        `Payment success webhook failed for MerchOrderId=${payload.merchOrderId}`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}
