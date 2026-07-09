import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EthSwitchTransaction } from '../ethswitch/entities/ethswitch-transaction.entity';
import {
  ETHSWITCH_CALLBACK_VERIFIER,
  PAYMENT_EVENT_PUBLISHER,
} from './constants/injection-tokens';
import { EthSwitchCallbackController } from './controllers/ethswitch-callback.controller';
import { PaymentCallbackLog } from './entities/payment-callback-log.entity';
import { Payment } from './entities/payment.entity';
import { HttpPaymentEventPublisher } from './publishers/http-payment-event.publisher';
import { EthSwitchCallbackService } from './services/ethswitch-callback.service';
import { PaymentCallbackLogService } from './services/payment-callback-log.service';
import { EthSwitchCallbackVerifier } from './verifiers/ethswitch-callback.verifier';

/**
 * Provider-agnostic payments module.
 *
 * Each payment provider gets its own callback controller + service under this
 * module. Shared concerns (audit logging, event publishing, Payment entity)
 * live here so Telebirr can follow the same pattern.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Payment,
      PaymentCallbackLog,
      EthSwitchTransaction,
    ]),
  ],
  controllers: [EthSwitchCallbackController],
  providers: [
    EthSwitchCallbackService,
    PaymentCallbackLogService,
    EthSwitchCallbackVerifier,
    HttpPaymentEventPublisher,
    {
      provide: PAYMENT_EVENT_PUBLISHER,
      useExisting: HttpPaymentEventPublisher,
    },
    {
      provide: ETHSWITCH_CALLBACK_VERIFIER,
      useExisting: EthSwitchCallbackVerifier,
    },
  ],
  exports: [EthSwitchCallbackService, PAYMENT_EVENT_PUBLISHER],
})
export class PaymentsModule {}
