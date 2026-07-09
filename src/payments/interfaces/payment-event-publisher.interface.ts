import { PaymentProvider } from '../constants/payment-provider.enum';
import { PaymentMethod } from '../constants/payment-method.enum';

/**
 * Domain event emitted when a payment reaches SUCCESS.
 * Subscribers (HTTP webhook, RabbitMQ, Kafka, etc.) implement
 * {@link IPaymentEventPublisher} without changing callback services.
 */
export interface PaymentCompletedEvent {
  paymentInfoId: number;
  applicationId: number;
  transactionReference: string;
  provider: PaymentProvider;
  providerTransactionId?: string;
  amount: string;
  currency: string;
  paymentMethod: PaymentMethod;
}

/**
 * Publishes payment lifecycle events to downstream systems.
 *
 * The default {@link HttpPaymentEventPublisher} POSTs to
 * `PAYMENT_SUCCESS_WEBHOOK_URL`. Swap the binding in PaymentsModule
 * to use RabbitMQ, Kafka, or another transport.
 */
export interface IPaymentEventPublisher {
  publishPaymentCompleted(event: PaymentCompletedEvent): Promise<void>;
}
