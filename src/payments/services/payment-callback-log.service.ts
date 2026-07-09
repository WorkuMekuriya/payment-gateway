import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentProvider } from '../constants/payment-provider.enum';
import { PaymentCallbackLog } from '../entities/payment-callback-log.entity';
import { CallbackProcessingOutcome } from '../interfaces/callback-handle-result.interface';

export interface CallbackLogInput {
  provider: PaymentProvider;
  correlationId: string;
  transactionReference?: string;
  requestHeaders: Record<string, unknown>;
  requestBody: string;
  sourceIp: string;
  outcome: CallbackProcessingOutcome;
  processingError?: string | null;
  durationMs: number;
}

/** Persists structured audit logs for every inbound payment callback. */
@Injectable()
export class PaymentCallbackLogService {
  private readonly logger = new Logger(PaymentCallbackLogService.name);

  constructor(
    @InjectRepository(PaymentCallbackLog)
    private readonly logRepo: Repository<PaymentCallbackLog>,
  ) {}

  async logCallback(input: CallbackLogInput): Promise<PaymentCallbackLog> {
    const entry = this.logRepo.create({
      provider: input.provider,
      correlationId: input.correlationId,
      transactionReference: input.transactionReference ?? null,
      requestHeaders: JSON.stringify(input.requestHeaders),
      requestBody: input.requestBody,
      sourceIp: input.sourceIp,
      processingResult: input.outcome,
      processingError: input.processingError ?? null,
      durationMs: input.durationMs,
    });

    const saved = await this.logRepo.save(entry);

    this.logger.log(
      `Callback logged: provider=${input.provider}, ref=${input.transactionReference ?? 'n/a'}, ` +
        `ip=${input.sourceIp}, outcome=${input.outcome}, duration=${input.durationMs}ms`,
    );

    return saved;
  }
}
