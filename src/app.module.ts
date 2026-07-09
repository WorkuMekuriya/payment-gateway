import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommonModule } from './common/common.module';
import ethswitchConfig from './config/ethswitch.config';
import paymentConfig from './config/payment.config';
import telebirrConfig from './config/telebirr.config';
import { EthSwitchModule } from './ethswitch/ethswitch.module';
import { EthSwitchApiLog } from './ethswitch/entities/ethswitch-api-log.entity';
import { EthSwitchTransaction } from './ethswitch/entities/ethswitch-transaction.entity';
import { PaymentCallbackLog } from './payments/entities/payment-callback-log.entity';
import { Payment } from './payments/entities/payment.entity';
import { PaymentsModule } from './payments/payments.module';
import { TelebirrModule } from './telebirr/telebirr.module';
import { TelebirrApiLog } from './telebirr/entities/telebirr-api-log.entity';
import { TelebirrTransaction } from './telebirr/entities/telebirr-transaction.entity';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [paymentConfig, ethswitchConfig, telebirrConfig],
    }),
    ScheduleModule.forRoot(),
    CommonModule,
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 10 }]),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get('DATABASE_HOST', 'localhost'),
        port: config.get<number>('DATABASE_PORT', 5432),
        username: config.get('DATABASE_USER', 'postgres'),
        password: config.get('DATABASE_PASSWORD', 'postgres'),
        database: config.get('DATABASE_NAME', 'efda_etswitch'),
        entities: [
          EthSwitchTransaction,
          EthSwitchApiLog,
          TelebirrTransaction,
          TelebirrApiLog,
          Payment,
          PaymentCallbackLog,
        ],
        synchronize: false,
      }),
    }),
    PaymentsModule,
    EthSwitchModule,
    TelebirrModule,
  ],
})
export class AppModule {}
