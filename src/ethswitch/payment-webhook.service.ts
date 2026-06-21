import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { Inject } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import ethswitchConfig from '../config/ethswitch.config';
import { PaymentSuccessWebhookDto } from './dto/ethswitch.dto';

/**
 * Notifies facility-license-be after a successful payment.
 * Replaces in-process HandlePaymentSuccessAsync from the monolith.
 */
@Injectable()
export class PaymentWebhookService {
  private readonly logger = new Logger(PaymentWebhookService.name);

  constructor(
    private readonly http: HttpService,
    @Inject(ethswitchConfig.KEY)
    private readonly config: ConfigType<typeof ethswitchConfig>,
  ) {}

  async notifyPaymentSuccess(payload: PaymentSuccessWebhookDto): Promise<void> {
    const url = this.config.paymentSuccessWebhookUrl?.trim();
    if (!url) {
      this.logger.warn(
        `PAYMENT_SUCCESS_WEBHOOK_URL not configured; skipping payment-success notification for ${payload.merchOrderId}`,
      );
      return;
    }

    try {
      await firstValueFrom(this.http.post(url, payload));
      this.logger.log(
        `Payment success webhook delivered for AppId=${payload.applicationId}, MerchOrderId=${payload.merchOrderId}`,
      );
    } catch (err) {
      this.logger.error(
        `Payment success webhook failed for MerchOrderId=${payload.merchOrderId}`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}
