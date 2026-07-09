import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { PaymentProvider } from '../constants/payment-provider.enum';

/** Audit log for every inbound payment callback request. */
@Entity({ schema: 'payment', name: 'payment_callback_log' })
export class PaymentCallbackLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 32 })
  provider: PaymentProvider;

  @Column({ name: 'correlation_id', type: 'varchar', length: 64, nullable: true })
  correlationId: string | null;

  @Column({ name: 'transaction_reference', type: 'varchar', length: 64, nullable: true })
  transactionReference: string | null;

  @Column({ name: 'request_headers', type: 'text', nullable: true })
  requestHeaders: string | null;

  @Column({ name: 'request_body', type: 'text', nullable: true })
  requestBody: string | null;

  @Column({ name: 'source_ip', type: 'varchar', length: 64, nullable: true })
  sourceIp: string | null;

  @Column({ name: 'processing_result', type: 'varchar', length: 32 })
  processingResult: string;

  @Column({ name: 'processing_error', type: 'text', nullable: true })
  processingError: string | null;

  @Column({ name: 'duration_ms', type: 'int', nullable: true })
  durationMs: number | null;

  @CreateDateColumn({ name: 'received_at', type: 'timestamptz' })
  receivedAt: Date;
}
