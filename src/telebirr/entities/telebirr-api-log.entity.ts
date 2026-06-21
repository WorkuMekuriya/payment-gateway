import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ schema: 'payment', name: 'telebirr_api_log' })
export class TelebirrApiLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 10 })
  direction: string;

  @Column({ name: 'api_method', type: 'varchar', length: 50 })
  apiMethod: string;

  @Column({
    name: 'merch_order_id',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  merchOrderId: string | null;

  @Column({
    name: 'correlation_id',
    type: 'varchar',
    length: 32,
    nullable: true,
  })
  correlationId: string | null;

  @Column({ name: 'request_payload', type: 'text', nullable: true })
  requestPayload: string | null;

  @Column({ name: 'response_payload', type: 'text', nullable: true })
  responsePayload: string | null;

  @Column({ name: 'http_status_code', type: 'int', nullable: true })
  httpStatusCode: number | null;

  @Column({ name: 'resp_code', type: 'varchar', length: 10, nullable: true })
  respCode: string | null;

  @Column({ name: 'resp_desc', type: 'varchar', length: 256, nullable: true })
  respDesc: string | null;

  @Column({ name: 'signature_valid', type: 'boolean', nullable: true })
  signatureValid: boolean | null;

  @Column({
    name: 'processing_status',
    type: 'varchar',
    length: 20,
    default: 'RECEIVED',
  })
  processingStatus: string;

  @Column({ name: 'processing_error', type: 'text', nullable: true })
  processingError: string | null;

  @Column({ name: 'duration_ms', type: 'int', nullable: true })
  durationMs: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
