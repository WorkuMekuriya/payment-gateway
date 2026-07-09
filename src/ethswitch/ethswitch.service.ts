import { Injectable, Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AxiosError } from 'axios';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { PaymentWebhookService } from '../common/payment-webhook.service';
import ethswitchConfig from '../config/ethswitch.config';
import {
  EthSwitchCallbackStatus,
  EthSwitchTransactionStatus,
} from './constants/statuses';
import {
  CallbackPayloadDto,
  EthSwitchPaymentResultDto,
  OrderRequestDto,
} from './dto/ethswitch.dto';
import { InitiatePaymentDto } from '../common/dto/payment.dto';
import { EthSwitchCallbackService } from '../payments/services/ethswitch-callback.service';
import { EthSwitchApiLog } from './entities/ethswitch-api-log.entity';
import { EthSwitchTransaction } from './entities/ethswitch-transaction.entity';
import { EthSwitchApiClient } from './ethswitch-api.client';
import { EthSwitchTokenCache } from './token-cache.service';

@Injectable()
export class EthSwitchService {
  private readonly logger = new Logger(EthSwitchService.name);

  constructor(
    @Inject(ethswitchConfig.KEY)
    private readonly config: ConfigType<typeof ethswitchConfig>,
    private readonly api: EthSwitchApiClient,
    @InjectRepository(EthSwitchTransaction)
    private readonly txRepo: Repository<EthSwitchTransaction>,
    @InjectRepository(EthSwitchApiLog)
    private readonly logRepo: Repository<EthSwitchApiLog>,
    private readonly tokenCache: EthSwitchTokenCache,
    private readonly webhook: PaymentWebhookService,
    private readonly ethSwitchCallbackService: EthSwitchCallbackService,
  ) {}

  async initiatePayment(
    applicationId: number,
    body: InitiatePaymentDto,
  ): Promise<EthSwitchPaymentResultDto> {
    const { paymentInfoId, amount } = body;
    const currency = body.currency?.trim() || this.config.currency || 'ETB';
    const title = `Application ${applicationId} Facility License Fee`;

    if (amount <= 0) {
      this.logger.error('EthSwitch:ApplicationFeeAmount is not configured.');
      return EthSwitchPaymentResultDto.failure(
        'AMOUNT_NOT_CONFIGURED',
        'Application fee is not configured.',
      );
    }

    const pendingTxs = await this.txRepo.find({
      where: { paymentInfoId, tradeStatus: EthSwitchTransactionStatus.Pending },
      order: { initiatedAt: 'DESC' },
    });

    const timeoutMinutes = this.extractTimeoutMinutes(
      this.config.timeoutExpress,
    );
    const latestTx = pendingTxs[0];

    if (latestTx?.checkoutUrl) {
      const windowExpiry = new Date(
        latestTx.initiatedAt.getTime() + timeoutMinutes * 60_000,
      );
      const validUntil =
        latestTx.expiresAt && latestTx.expiresAt < windowExpiry
          ? latestTx.expiresAt
          : windowExpiry;

      if (new Date() <= validUntil) {
        return {
          success: true,
          checkoutUrl: latestTx.checkoutUrl,
          merchOrderId: latestTx.merchOrderId,
          transactionId: latestTx.id,
          applicationId,
          amount: Number(latestTx.totalAmount).toFixed(2),
          isResume: true,
        };
      }
    }

    for (const staleTx of pendingTxs) {
      staleTx.tradeStatus = EthSwitchTransactionStatus.TimedOut;
      staleTx.modifiedDate = new Date();
      await this.txRepo.save(staleTx);
    }

    const merchOrderId = this.generateMerchOrderId(applicationId);

    const request: OrderRequestDto = {
      amount,
      currency,
      merchantOrderNumber: merchOrderId,
      idempotencyKey: merchOrderId,
      description: title,
      successUrl: this.buildApplicationDetailUrl(applicationId),
      cancelUrl: this.buildCancelReturnUrl(merchOrderId),
      callbackUrl: this.config.notifyUrl,
      lineItems: [
        {
          itemName: 'Application Fee',
          quantity: 1,
          unitPrice: amount,
          totalUsageAmount: amount,
        },
      ],
    };

    const started = Date.now();
    try {
      const token = await this.tokenCache.getToken(() => this.fetchToken());
      const response = await this.api.registerOrder(request, token);
      await this.logOutboundSafe(
        'order.create',
        merchOrderId,
        request,
        response,
        200,
        'SUCCESS',
        null,
        Date.now() - started,
      );

      if (!response?.hppUrl?.trim()) {
        this.logger.warn(
          `EthSwitch order.create returned no hosted payment page for AppId=${applicationId}. Response keys: ${JSON.stringify(response)}`,
        );
        return EthSwitchPaymentResultDto.failure(
          'API_ERROR',
          'Payment gateway returned an unexpected response. Please try again.',
        );
      }

      const tx = this.txRepo.create({
        paymentInfoId,
        applicationId,
        merchOrderId,
        orderReference: response.orderReference ?? null,
        hppToken: response.hppToken ?? null,
        tradeStatus: EthSwitchTransactionStatus.Pending,
        totalAmount: amount.toFixed(2),
        transCurrency: currency,
        title,
        checkoutUrl: response.hppUrl,
        initiatedAt: new Date(),
        expiresAt: response.expiresAt ? new Date(response.expiresAt) : null,
      });
      await this.txRepo.save(tx);
      await this.ethSwitchCallbackService.ensurePaymentRecord(tx);

      this.logger.log(
        `EthSwitch payment initiated: AppId=${applicationId}, MerchOrderId=${merchOrderId}, Amount=${amount}, TxId=${tx.id}`,
      );

      return {
        success: true,
        checkoutUrl: response.hppUrl,
        merchOrderId,
        transactionId: tx.id,
        applicationId,
        amount: amount.toFixed(2),
      };
    } catch (err) {
      const httpStatus =
        err instanceof AxiosError && err.response?.status
          ? err.response.status
          : 0;
      await this.logOutboundSafe(
        'order.create',
        merchOrderId,
        request,
        null,
        httpStatus,
        'ERROR',
        err instanceof Error ? err.message : String(err),
        Date.now() - started,
      );
      this.logger.error(
        err,
        `EthSwitch order.create call failed for AppId=${applicationId}`,
      );
      return EthSwitchPaymentResultDto.failure(
        'API_ERROR',
        'Failed to reach the EthSwitch payment gateway. Please try again.',
      );
    }
  }

  async processCallback(payload: CallbackPayloadDto): Promise<void> {
    const merchOrderId = payload?.data?.request_id;
    if (!merchOrderId) {
      this.logger.warn(
        'EthSwitch callback missing request_id; cannot match a transaction.',
      );
      return;
    }

    const tx = await this.txRepo.findOne({ where: { merchOrderId } });
    if (!tx) {
      this.logger.warn(
        `EthSwitch callback for unknown MerchOrderId ${merchOrderId}`,
      );
      return;
    }

    if (
      tx.tradeStatus === EthSwitchTransactionStatus.Success ||
      tx.tradeStatus === EthSwitchTransactionStatus.Failed
    ) {
      this.logger.log(
        `EthSwitch callback for ${merchOrderId} skipped - already ${tx.tradeStatus}`,
      );
      return;
    }

    const status = (payload.status ?? payload.current_status ?? '')
      .trim()
      .toUpperCase();

    let newStatus: string | null = null;
    if (status === EthSwitchCallbackStatus.Paid) {
      newStatus = EthSwitchTransactionStatus.Success;
    } else if (status === EthSwitchCallbackStatus.Failed) {
      newStatus = EthSwitchTransactionStatus.Failed;
    }

    if (!newStatus) {
      this.logger.log(
        `EthSwitch callback for ${merchOrderId} received with non-terminal status ${status} — ignored`,
      );
      return;
    }

    if (
      newStatus === EthSwitchTransactionStatus.Success &&
      !this.isCallbackAmountValid(tx, payload)
    ) {
      this.logger.warn(
        `EthSwitch callback amount/currency mismatch for ${merchOrderId}; marking failed, not submitting.`,
      );
      newStatus = EthSwitchTransactionStatus.Failed;
    }

    tx.tradeStatus = newStatus;
    tx.transId = payload.transaction_id ?? null;
    tx.billPaymentRequestId = payload.data?.bill_payment_request_id ?? null;
    tx.rawCallback = JSON.stringify(payload);
    tx.callbackReceivedAt = new Date();
    tx.modifiedDate = new Date();
    await this.txRepo.save(tx);

    if (newStatus === EthSwitchTransactionStatus.Success) {
      await this.webhook.notifyPaymentSuccess({
        paymentInfoId: tx.paymentInfoId,
        applicationId: tx.applicationId,
        merchOrderId: tx.merchOrderId,
        provider: 'ETHSWITCH',
        transId: tx.transId ?? undefined,
      });
    }

    this.logger.log(
      `EthSwitch callback processed: ${merchOrderId} -> ${newStatus}`,
    );
  }

  async cancelPayment(merchOrderId: string): Promise<number | null> {
    if (!merchOrderId?.trim()) return null;

    const tx = await this.txRepo.findOne({ where: { merchOrderId } });
    if (!tx) {
      this.logger.warn(
        `EthSwitch cancel return for unknown MerchOrderId ${merchOrderId}`,
      );
      return null;
    }

    if (tx.tradeStatus === EthSwitchTransactionStatus.Pending) {
      tx.tradeStatus = EthSwitchTransactionStatus.Cancelled;
      tx.modifiedDate = new Date();
      await this.txRepo.save(tx);
      this.logger.log(`EthSwitch payment cancelled by payer: ${merchOrderId}`);
    }

    return tx.applicationId;
  }

  buildApplicationDetailUrl(applicationId?: number | null): string {
    const baseUrl = (this.config.frontendBaseUrl ?? '').replace(/\/$/, '');
    return applicationId && applicationId > 0
      ? `${baseUrl}/applications/detail/${applicationId}`
      : `${baseUrl}/applications/all`;
  }

  invalidateToken(): void {
    this.tokenCache.invalidate();
    this.logger.warn('EthSwitch bearer token invalidated due to auth failure');
  }

  async logInbound(
    apiMethod: string,
    merchOrderId: string | undefined,
    correlationId: string,
    payload: unknown,
    durationMs: number,
    error?: string | null,
  ): Promise<EthSwitchApiLog> {
    const log = this.logRepo.create({
      direction: 'INBOUND',
      apiMethod,
      merchOrderId: merchOrderId ?? null,
      correlationId,
      requestPayload: JSON.stringify(payload),
      httpStatusCode: 200,
      processingStatus: error ? 'FAILED' : 'RECEIVED',
      processingError: error ?? null,
      durationMs,
      createdAt: new Date(),
    });
    return this.logRepo.save(log);
  }

  private buildCancelReturnUrl(merchOrderId: string): string {
    const baseUrl = (this.config.cancelUrl ?? '').replace(/\/$/, '');
    return `${baseUrl}?merchOrderId=${encodeURIComponent(merchOrderId)}`;
  }

  private async fetchToken(): Promise<string> {
    let response;
    try {
      response = await this.api.authenticate({
        username: this.config.username,
        password: this.config.password,
      });
    } catch (err) {
      this.logger.error(err, 'EthSwitch login failed');
      throw new Error(
        'Failed to authenticate with the EthSwitch payment gateway.',
      );
    }

    const accessToken = response?.access_token;
    if (!accessToken) {
      this.logger.error('EthSwitch login response missing access_token');
      throw new Error(
        'EthSwitch payment gateway returned an invalid token response.',
      );
    }

    const expiresIn = response.expires_in ?? 300;
    if (expiresIn > 0) {
      this.tokenCache.setWithExpiry(accessToken, expiresIn * 1000);
    }
    return accessToken;
  }

  private isCallbackAmountValid(
    tx: EthSwitchTransaction,
    payload: CallbackPayloadDto,
  ): boolean {
    const billInfo = payload?.data?.bill_info;
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

  private generateMerchOrderId(applicationId: number): string {
    return `FL${applicationId}${uuidv4().replace(/-/g, '').slice(0, 12)}`;
  }

  private extractTimeoutMinutes(timeoutExpress: string): number {
    if (!timeoutExpress) return 120;
    const trimmed = timeoutExpress.replace(/m$/i, '');
    const minutes = parseInt(trimmed, 10);
    return Number.isFinite(minutes) ? minutes : 120;
  }

  private async logOutboundSafe(
    method: string,
    merchOrderId: string,
    request: unknown,
    response: unknown,
    httpStatus: number,
    respCode: string,
    respDesc: string | null,
    durationMs: number,
  ): Promise<void> {
    try {
      const log = this.logRepo.create({
        direction: 'OUTBOUND',
        apiMethod: method,
        merchOrderId,
        correlationId: uuidv4().replace(/-/g, ''),
        requestPayload: JSON.stringify(request),
        responsePayload: JSON.stringify(response),
        httpStatusCode: httpStatus,
        respCode,
        respDesc,
        durationMs,
        processingStatus: 'PROCESSED',
        createdAt: new Date(),
      });
      await this.logRepo.save(log);
    } catch (err) {
      this.logger.warn(err, `Failed to log outbound ${method} call`);
    }
  }
}
