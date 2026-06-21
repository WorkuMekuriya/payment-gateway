import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ schema: 'payment', name: 'telebirr_transaction' })
@Index('uq_telebirr_tx_merch_order_id', ['merchOrderId'], { unique: true })
export class TelebirrTransaction {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'payment_info_id', type: 'int' })
  paymentInfoId: number;

  @Column({ name: 'application_id', type: 'int' })
  applicationId: number;

  @Column({ name: 'merch_order_id', type: 'varchar', length: 64 })
  merchOrderId: string;

  @Column({
    name: 'payment_order_id',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  paymentOrderId: string | null;

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
    length: 3,
    default: 'ETB',
  })
  transCurrency: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  title: string | null;

  @Column({ name: 'prepay_id', type: 'varchar', length: 64, nullable: true })
  prepayId: string | null;

  @Column({ name: 'checkout_url', type: 'text', nullable: true })
  checkoutUrl: string | null;

  @Column({ name: 'reconciled_at', type: 'timestamptz', nullable: true })
  reconciledAt: Date | null;

  @Column({ name: 'reconcile_attempts', type: 'int', default: 0 })
  reconcileAttempts: number;

  @Column({ name: 'initiated_at', type: 'timestamptz', default: () => 'now()' })
  initiatedAt: Date;

  @Column({ name: 'callback_received_at', type: 'timestamptz', nullable: true })
  callbackReceivedAt: Date | null;

  @CreateDateColumn({ name: 'created_date' })
  createdDate: Date;

  @UpdateDateColumn({ name: 'modified_date' })
  modifiedDate: Date;
}
