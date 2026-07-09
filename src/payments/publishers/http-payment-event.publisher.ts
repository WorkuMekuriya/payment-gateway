import { Injectable, Logger } from '@nestjs/common';
import { PaymentWebhookService } from '../../common/payment-webhook.service';
import { PaymentProvider } from '../constants/payment-provider.enum';
import {
  IPaymentEventPublisher,
  PaymentCompletedEvent,
} from '../interfaces/payment-event-publisher.interface';

/**
 * Default {@link IPaymentEventPublisher} — delivers PaymentCompleted via HTTP
 * webhook to the main backend (`PAYMENT_SUCCESS_WEBHOOK_URL`).
 *
 * Replace this binding in PaymentsModule to publish via RabbitMQ, Kafka, etc.
 */
@Injectable()
export class HttpPaymentEventPublisher implements IPaymentEventPublisher {
  private readonly logger = new Logger(HttpPaymentEventPublisher.name);

  constructor(private readonly webhook: PaymentWebhookService) {}

  async publishPaymentCompleted(event: PaymentCompletedEvent): Promise<void> {
    this.logger.log(
      `Publishing PaymentCompleted: provider=${event.provider}, ref=${event.transactionReference}`,
    );

    await this.webhook.notifyPaymentSuccess({
      paymentInfoId: event.paymentInfoId,
      applicationId: event.applicationId,
      merchOrderId: event.transactionReference,
      provider: event.provider as 'ETHSWITCH' | 'TELEBIRR',
      transId: event.providerTransactionId,
    });
  }
}
