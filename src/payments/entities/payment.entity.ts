import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PaymentProvider } from '../constants/payment-provider.enum';
import { PaymentMethod } from '../constants/payment-method.enum';
import { PaymentStatus } from '../constants/payment-status.enum';

/**
 * Provider-agnostic payment record.
 * One row per payment attempt; updated on provider callbacks.
 */
@Entity({ schema: 'payment', name: 'payment' })
@Index('uq_payment_provider_tx_ref', ['provider', 'transactionReference'], {
  unique: true,
})
export class Payment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'payment_info_id', type: 'int' })
  paymentInfoId: number;

  @Column({ name: 'application_id', type: 'int' })
  applicationId: number;

  /** Merchant / gateway order id (our idempotency key). */
  @Column({ name: 'transaction_reference', type: 'varchar', length: 64 })
  transactionReference: string;

  /** Provider-assigned transaction id (e.g. EthSwitch transaction_id). */
  @Column({
    name: 'provider_transaction_id',
    type: 'varchar',
    length: 128,
    nullable: true,
  })
  providerTransactionId: string | null;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  amount: string;

  @Column({ type: 'varchar', length: 10, default: 'ETB' })
  currency: string;

  @Column({
    name: 'payment_status',
    type: 'varchar',
    length: 20,
    default: PaymentStatus.PENDING,
  })
  paymentStatus: PaymentStatus;

  @Column({ name: 'payment_method', type: 'varchar', length: 32 })
  paymentMethod: PaymentMethod;

  @Column({ type: 'varchar', length: 32 })
  provider: PaymentProvider;

  /** Full callback JSON stored for auditing and dispute resolution. */
  @Column({ name: 'callback_payload', type: 'text', nullable: true })
  callbackPayload: string | null;

  @Column({ name: 'callback_received_at', type: 'timestamptz', nullable: true })
  callbackReceivedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
