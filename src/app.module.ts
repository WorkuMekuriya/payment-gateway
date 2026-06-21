import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import ethswitchConfig from './config/ethswitch.config';
import { EthSwitchModule } from './ethswitch/ethswitch.module';
import { EthSwitchApiLog } from './ethswitch/entities/ethswitch-api-log.entity';
import { EthSwitchTransaction } from './ethswitch/entities/ethswitch-transaction.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [ethswitchConfig] }),
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
        entities: [EthSwitchTransaction, EthSwitchApiLog],
        synchronize: false,
      }),
    }),
    EthSwitchModule,
  ],
})
export class AppModule {}
