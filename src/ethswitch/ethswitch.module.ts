import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentsModule } from '../payments/payments.module';
import { EthSwitchApiLog } from './entities/ethswitch-api-log.entity';
import { EthSwitchTransaction } from './entities/ethswitch-transaction.entity';
import { EthSwitchApiClient } from './ethswitch-api.client';
import { EthSwitchController } from './ethswitch.controller';
import { EthSwitchService } from './ethswitch.service';
import { EthSwitchTokenCache } from './token-cache.service';

@Module({
  imports: [
    HttpModule.register({ timeout: 30_000 }),
    TypeOrmModule.forFeature([EthSwitchTransaction, EthSwitchApiLog]),
    PaymentsModule,
  ],
  controllers: [EthSwitchController],
  providers: [EthSwitchService, EthSwitchApiClient, EthSwitchTokenCache],
})
export class EthSwitchModule {}
