import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/** Mirrors payment.ethswitch_transaction */
@Entity({ schema: 'payment', name: 'ethswitch_transaction' })
@Index('uq_ethswitch_tx_merch_order_id', ['merchOrderId'], { unique: true })
export class EthSwitchTransaction {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'payment_info_id', type: 'int' })
  paymentInfoId: number;

  @Column({ name: 'application_id', type: 'int' })
  applicationId: number;

  @Column({ name: 'merch_order_id', type: 'varchar', length: 64 })
  merchOrderId: string;

  @Column({
    name: 'order_reference',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  orderReference: string | null;

  @Column({ name: 'hpp_token', type: 'varchar', length: 64, nullable: true })
  hppToken: string | null;

  @Column({
    name: 'bill_payment_request_id',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  billPaymentRequestId: string | null;

  @Column({ name: 'trans_id', type: 'varchar', length: 64, nullable: true })
  transId: string | null;

  @Column({
    name: 'trade_status',
    type: 'varchar',
    length: 20,
    default: 'PENDING',
  })
  tradeStatus: string;

  @Column({ name: 'total_amount', type: 'numeric', precision: 12, scale: 2 })
  totalAmount: string;

  @Column({
    name: 'trans_currency',
    type: 'varchar',
    length: 10,
    default: 'ETB',
  })
  transCurrency: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  title: string | null;

  @Column({ name: 'checkout_url', type: 'text', nullable: true })
  checkoutUrl: string | null;

  @Column({ name: 'initiated_at', type: 'timestamptz', default: () => 'now()' })
  initiatedAt: Date;

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @Column({ name: 'callback_received_at', type: 'timestamptz', nullable: true })
  callbackReceivedAt: Date | null;

  @Column({ name: 'raw_callback', type: 'text', nullable: true })
  rawCallback: string | null;

  @CreateDateColumn({ name: 'created_date' })
  createdDate: Date;

  @UpdateDateColumn({ name: 'modified_date' })
  modifiedDate: Date;
}
