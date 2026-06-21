import { Injectable, Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { Inject } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import telebirrConfig from '../config/telebirr.config';
import { TelebirrService } from './telebirr.service';

@Injectable()
export class TelebirrReconciliationJob {
  private readonly logger = new Logger(TelebirrReconciliationJob.name);

  constructor(
    private readonly telebirrService: TelebirrService,
    @Inject(telebirrConfig.KEY)
    private readonly config: ConfigType<typeof telebirrConfig>,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async handleCron(): Promise<void> {
    if (!this.config.baseUrl) return;
    try {
      await this.telebirrService.reconcilePendingTransactions();
    } catch (err) {
      this.logger.error(err, 'Telebirr reconciliation job failed');
    }
  }
}
