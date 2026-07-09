import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { Request } from 'express';
import { DataSource, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import {
  EthSwitchCallbackStatus,
  EthSwitchTransactionStatus,
} from '../../ethswitch/constants/statuses';
import { EthSwitchTransaction } from '../../ethswitch/entities/ethswitch-transaction.entity';
import { PAYMENT_EVENT_PUBLISHER } from '../constants/injection-tokens';
import { PaymentMethod } from '../constants/payment-method.enum';
import { PaymentProvider } from '../constants/payment-provider.enum';
import {
  PaymentStatus,
  TERMINAL_PAYMENT_STATUSES,
} from '../constants/payment-status.enum';
import { EthSwitchCallbackDto } from '../dto/ethswitch-callback.dto';
import {
  CallbackHandleResult,
  CallbackProcessingOutcome,
} from '../interfaces/callback-handle-result.interface';
import {
  extractSourceIp,
  normalizeHeaders,
} from '../interfaces/callback-verifier.interface';
import type { IPaymentEventPublisher } from '../interfaces/payment-event-publisher.interface';
import { PaymentCallbackLog } from '../entities/payment-callback-log.entity';
import { Payment } from '../entities/payment.entity';
import { PaymentCallbackLogService } from './payment-callback-log.service';
import { EthSwitchCallbackVerifier } from '../verifiers/ethswitch-callback.verifier';

/**
 * Orchestrates EthSwitch callback handling: validation, verification,
 * idempotency, transactional persistence, and event publication.
 */
@Injectable()
export class EthSwitchCallbackService {
  private readonly logger = new Logger(EthSwitchCallbackService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(EthSwitchTransaction)
    private readonly ethSwitchTxRepo: Repository<EthSwitchTransaction>,
    private readonly callbackLogService: PaymentCallbackLogService,
    private readonly verifier: EthSwitchCallbackVerifier,
    @Inject(PAYMENT_EVENT_PUBLISHER)
    private readonly eventPublisher: IPaymentEventPublisher,
  ) {}

  /**
   * Main entry point for EthSwitch NGB callbacks.
   * Controller delegates here — no business logic in the controller layer.
   */
  async handleCallback(
    req: Request & { rawBody?: Buffer },
  ): Promise<CallbackHandleResult> {
    const started = Date.now();
    const correlationId =
      (req.headers['x-correlation-id'] as string | undefined) ??
      uuidv4().replace(/-/g, '');
    const sourceIp = extractSourceIp(req);
    const headers = normalizeHeaders(req);
    const rawBody = this.extractRawBody(req);

    let payload: EthSwitchCallbackDto | null = null;
    let validationError: string | null = null;

    // Step 1: Deserialize and validate payload
    try {
      payload = await this.parseAndValidatePayload(rawBody);
    } catch (err) {
      validationError =
        err instanceof Error ? err.message : 'Invalid callback payload';
    }

    const transactionReference = payload?.data?.request_id;

    // Step 2: Verify callback authenticity before any state mutation
    if (payload && !validationError) {
      const verified = await this.verifier.verify({
        rawBody,
        headers,
        sourceIp,
        payload,
      });

      if (!verified) {
        await this.callbackLogService.logCallback({
          provider: PaymentProvider.ETHSWITCH,
          correlationId,
          transactionReference,
          requestHeaders: headers,
          requestBody: rawBody,
          sourceIp,
          outcome: CallbackProcessingOutcome.VERIFICATION_FAILED,
          processingError: 'Callback verification failed',
          durationMs: Date.now() - started,
        });

        return {
          outcome: CallbackProcessingOutcome.VERIFICATION_FAILED,
          message: 'Callback verification failed.',
          transactionReference,
        };
      }
    }

    if (validationError || !payload) {
      await this.callbackLogService.logCallback({
        provider: PaymentProvider.ETHSWITCH,
        correlationId,
        transactionReference,
        requestHeaders: headers,
        requestBody: rawBody,
        sourceIp,
        outcome: CallbackProcessingOutcome.INVALID_PAYLOAD,
        processingError: validationError,
        durationMs: Date.now() - started,
      });

      return {
        outcome: CallbackProcessingOutcome.INVALID_PAYLOAD,
        message: validationError ?? 'Invalid callback payload.',
        transactionReference,
      };
    }

    // Step 3: Process callback inside a DB transaction
    try {
      const result = await this.processCallbackInTransaction(
        payload,
        rawBody,
        correlationId,
        headers,
        sourceIp,
        started,
      );
      return result;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Unexpected processing error';

      await this.callbackLogService.logCallback({
        provider: PaymentProvider.ETHSWITCH,
        correlationId,
        transactionReference,
        requestHeaders: headers,
        requestBody: rawBody,
        sourceIp,
        outcome: CallbackProcessingOutcome.INTERNAL_ERROR,
        processingError: errorMessage,
        durationMs: Date.now() - started,
      });

      this.logger.error(err, 'EthSwitch callback processing failed');

      return {
        outcome: CallbackProcessingOutcome.INTERNAL_ERROR,
        message: errorMessage,
        transactionReference,
      };
    }
  }

  /** Creates or updates the canonical Payment row when initiate runs. */
  async ensurePaymentRecord(tx: EthSwitchTransaction): Promise<Payment> {
    const existing = await this.paymentRepo.findOne({
      where: {
        provider: PaymentProvider.ETHSWITCH,
        transactionReference: tx.merchOrderId,
      },
    });

    if (existing) {
      return existing;
    }

    const payment = this.paymentRepo.create({
      paymentInfoId: tx.paymentInfoId,
      applicationId: tx.applicationId,
      transactionReference: tx.merchOrderId,
      amount: tx.totalAmount,
      currency: tx.transCurrency,
      paymentStatus: this.mapEthSwitchTradeStatus(tx.tradeStatus),
      paymentMethod: PaymentMethod.HPP,
      provider: PaymentProvider.ETHSWITCH,
    });

    return this.paymentRepo.save(payment);
  }

  private async processCallbackInTransaction(
    payload: EthSwitchCallbackDto,
    rawBody: string,
    correlationId: string,
    headers: Record<string, string | string[] | undefined>,
    sourceIp: string,
    started: number,
  ): Promise<CallbackHandleResult> {
    const transactionReference = payload.data.request_id;

    return this.dataSource.transaction(async (manager) => {
      const ethSwitchTxRepo = manager.getRepository(EthSwitchTransaction);
      const paymentRepo = manager.getRepository(Payment);

      const ethSwitchTx = await ethSwitchTxRepo.findOne({
        where: { merchOrderId: transactionReference },
      });

      if (!ethSwitchTx) {
        await this.logWithinTransaction(manager, {
          provider: PaymentProvider.ETHSWITCH,
          correlationId,
          transactionReference,
          requestHeaders: headers,
          requestBody: rawBody,
          sourceIp,
          outcome: CallbackProcessingOutcome.PROCESSED,
          processingError: `Unknown transaction reference: ${transactionReference}`,
          durationMs: Date.now() - started,
        });

        this.logger.warn(
          `EthSwitch callback for unknown transaction reference ${transactionReference}`,
        );

        return {
          outcome: CallbackProcessingOutcome.PROCESSED,
          message: 'Callback acknowledged; transaction not found.',
          transactionReference,
        };
      }

      // Resolve or create canonical Payment record
      let payment =
        (await paymentRepo.findOne({
          where: {
            provider: PaymentProvider.ETHSWITCH,
            transactionReference,
          },
        })) ??
        paymentRepo.create({
          paymentInfoId: ethSwitchTx.paymentInfoId,
          applicationId: ethSwitchTx.applicationId,
          transactionReference,
          amount: ethSwitchTx.totalAmount,
          currency: ethSwitchTx.transCurrency,
          paymentStatus: PaymentStatus.PENDING,
          paymentMethod: PaymentMethod.HPP,
          provider: PaymentProvider.ETHSWITCH,
        });

      // Idempotency: skip re-processing when already terminal (especially SUCCESS)
      if (TERMINAL_PAYMENT_STATUSES.has(payment.paymentStatus)) {
        await this.logWithinTransaction(manager, {
          provider: PaymentProvider.ETHSWITCH,
          correlationId,
          transactionReference,
          requestHeaders: headers,
          requestBody: rawBody,
          sourceIp,
          outcome: CallbackProcessingOutcome.DUPLICATE,
          durationMs: Date.now() - started,
        });

        this.logger.log(
          `EthSwitch callback duplicate for ${transactionReference} — already ${payment.paymentStatus}`,
        );

        return {
          outcome: CallbackProcessingOutcome.DUPLICATE,
          message: `Callback already processed with status ${payment.paymentStatus}.`,
          transactionReference,
        };
      }

      const callbackStatus = (payload.status ?? payload.current_status ?? '')
        .trim()
        .toUpperCase();

      let newPaymentStatus: PaymentStatus | null = null;
      if (callbackStatus === EthSwitchCallbackStatus.Paid) {
        newPaymentStatus = PaymentStatus.SUCCESS;
      } else if (callbackStatus === EthSwitchCallbackStatus.Failed) {
        newPaymentStatus = PaymentStatus.FAILED;
      }

      if (!newPaymentStatus) {
        await this.logWithinTransaction(manager, {
          provider: PaymentProvider.ETHSWITCH,
          correlationId,
          transactionReference,
          requestHeaders: headers,
          requestBody: rawBody,
          sourceIp,
          outcome: CallbackProcessingOutcome.PROCESSED,
          processingError: `Non-terminal callback status: ${callbackStatus}`,
          durationMs: Date.now() - started,
        });

        this.logger.log(
          `EthSwitch callback for ${transactionReference} ignored — non-terminal status ${callbackStatus}`,
        );

        return {
          outcome: CallbackProcessingOutcome.PROCESSED,
          message: `Non-terminal status ${callbackStatus} ignored.`,
          transactionReference,
        };
      }

      // Amount/currency integrity check before marking success
      if (
        newPaymentStatus === PaymentStatus.SUCCESS &&
        !this.isAmountValid(ethSwitchTx, payload)
      ) {
        this.logger.warn(
          `EthSwitch callback amount/currency mismatch for ${transactionReference}`,
        );
        newPaymentStatus = PaymentStatus.FAILED;
      }

      const now = new Date();
      const providerTransactionId = payload.transaction_id ?? null;

      // Update provider-specific transaction
      ethSwitchTx.tradeStatus = this.mapPaymentStatusToEthSwitch(
        newPaymentStatus,
      );
      ethSwitchTx.transId = providerTransactionId;
      ethSwitchTx.billPaymentRequestId =
        payload.data.bill_payment_request_id ?? null;
      ethSwitchTx.rawCallback = rawBody;
      ethSwitchTx.callbackReceivedAt = now;
      ethSwitchTx.modifiedDate = now;
      await ethSwitchTxRepo.save(ethSwitchTx);

      // Update canonical Payment entity
      payment.providerTransactionId = providerTransactionId;
      payment.paymentStatus = newPaymentStatus;
      payment.callbackPayload = rawBody;
      payment.callbackReceivedAt = now;
      payment.updatedAt = now;
      payment = await paymentRepo.save(payment);

      await this.logWithinTransaction(manager, {
        provider: PaymentProvider.ETHSWITCH,
        correlationId,
        transactionReference,
        requestHeaders: headers,
        requestBody: rawBody,
        sourceIp,
        outcome: CallbackProcessingOutcome.PROCESSED,
        durationMs: Date.now() - started,
      });

      // Publish event after successful commit (outside transaction would be safer for
      // exactly-once delivery; here we publish after DB commit via transaction completion)
      if (newPaymentStatus === PaymentStatus.SUCCESS) {
        await this.eventPublisher.publishPaymentCompleted({
          paymentInfoId: payment.paymentInfoId,
          applicationId: payment.applicationId,
          transactionReference: payment.transactionReference,
          provider: PaymentProvider.ETHSWITCH,
          providerTransactionId: payment.providerTransactionId ?? undefined,
          amount: payment.amount,
          currency: payment.currency,
          paymentMethod: payment.paymentMethod,
        });
      }

      this.logger.log(
        `EthSwitch callback processed: ${transactionReference} -> ${newPaymentStatus}`,
      );

      return {
        outcome: CallbackProcessingOutcome.PROCESSED,
        message: `Payment updated to ${newPaymentStatus}.`,
        transactionReference,
      };
    });
  }

  private async logWithinTransaction(
    manager: import('typeorm').EntityManager,
    input: Parameters<PaymentCallbackLogService['logCallback']>[0],
  ): Promise<void> {
    const logRepo = manager.getRepository(PaymentCallbackLog);
    const entry = logRepo.create({
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
    await logRepo.save(entry);
  }

  private extractRawBody(req: Request & { rawBody?: Buffer }): string {
    return (
      req.rawBody?.toString('utf8') ??
      (typeof req.body === 'string'
        ? req.body
        : req.body && Object.keys(req.body).length
          ? JSON.stringify(req.body)
          : '')
    );
  }

  private async parseAndValidatePayload(
    rawBody: string,
  ): Promise<EthSwitchCallbackDto> {
    if (!rawBody?.trim()) {
      throw new Error('Callback body is empty.');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      throw new Error('Callback body is not valid JSON.');
    }

    const dto = plainToInstance(EthSwitchCallbackDto, parsed);
    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: false,
    });

    if (errors.length > 0) {
      const messages = errors
        .flatMap((e) => Object.values(e.constraints ?? {}))
        .join('; ');
      throw new Error(messages || 'Callback validation failed.');
    }

    return dto;
  }

  private isAmountValid(
    tx: EthSwitchTransaction,
    payload: EthSwitchCallbackDto,
  ): boolean {
    const billInfo = payload.data?.bill_info;
    const reportedAmount = billInfo?.totalAmount ?? billInfo?.amountDue;

    if (
      reportedAmount !== undefined &&
      reportedAmount !== Number(tx.totalAmount)
    ) {
      return false;
    }

    if (
      billInfo?.currency &&
      billInfo.currency.toUpperCase() !== tx.transCurrency.toUpperCase()
    ) {
      return false;
    }

    return true;
  }

  private mapEthSwitchTradeStatus(tradeStatus: string): PaymentStatus {
    switch (tradeStatus) {
      case EthSwitchTransactionStatus.Success:
        return PaymentStatus.SUCCESS;
      case EthSwitchTransactionStatus.Failed:
        return PaymentStatus.FAILED;
      case EthSwitchTransactionStatus.Cancelled:
        return PaymentStatus.CANCELLED;
      case EthSwitchTransactionStatus.TimedOut:
        return PaymentStatus.EXPIRED;
      default:
        return PaymentStatus.PENDING;
    }
  }

  private mapPaymentStatusToEthSwitch(status: PaymentStatus): string {
    switch (status) {
      case PaymentStatus.SUCCESS:
        return EthSwitchTransactionStatus.Success;
      case PaymentStatus.FAILED:
        return EthSwitchTransactionStatus.Failed;
      case PaymentStatus.CANCELLED:
        return EthSwitchTransactionStatus.Cancelled;
      case PaymentStatus.EXPIRED:
        return EthSwitchTransactionStatus.TimedOut;
      default:
        return EthSwitchTransactionStatus.Pending;
    }
  }
}