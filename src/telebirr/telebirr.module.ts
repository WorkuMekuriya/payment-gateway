import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigType } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { createHttpsAgent } from '../common/utils/https-agent.util';
import telebirrConfig from '../config/telebirr.config';
import { TelebirrApiLog } from './entities/telebirr-api-log.entity';
import { TelebirrTransaction } from './entities/telebirr-transaction.entity';
import { TelebirrApiClient } from './telebirr-api.client';
import { TelebirrController } from './telebirr.controller';
import { TelebirrReconciliationJob } from './telebirr-reconciliation.job';
import { TelebirrService } from './telebirr.service';
import { TelebirrTokenCache } from './token-cache.service';

@Module({
  imports: [
    HttpModule.registerAsync({
      imports: [ConfigModule],
      inject: [telebirrConfig.KEY],
      useFactory: (config: ConfigType<typeof telebirrConfig>) => ({
        timeout: 30_000,
        httpsAgent: createHttpsAgent(!config.allowInsecureTls),
      }),
    }),
    TypeOrmModule.forFeature([TelebirrTransaction, TelebirrApiLog]),
  ],
  controllers: [TelebirrController],
  providers: [
    TelebirrService,
    TelebirrApiClient,
    TelebirrTokenCache,
    TelebirrReconciliationJob,
  ],
})
export class TelebirrModule {}
