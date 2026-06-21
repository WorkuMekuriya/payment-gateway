import { Injectable, Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AxiosError } from 'axios';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { PaymentWebhookService } from '../common/payment-webhook.service';
import telebirrConfig from '../config/telebirr.config';
import {
  TelebirrCallbackStatus,
  TelebirrOrderStatus,
  TelebirrTransactionStatus,
} from './constants/statuses';
import {
  extractPrepayId,
  extractQueryFields,
  TelebirrPaymentResultDto,
  TelebirrQueryResultDto,
  TelebirrReconcileResultDto,
} from './dto/telebirr.dto';
import { TelebirrApiLog } from './entities/telebirr-api-log.entity';
import { TelebirrTransaction } from './entities/telebirr-transaction.entity';
import { TelebirrApiClient } from './telebirr-api.client';
import { TelebirrTokenCache } from './token-cache.service';
import {
  buildCallbackSignString,
  buildTelebirrCheckoutUrl,
  signTelebirrRequest,
  TelebirrCallbackPayloadDto,
  verifyTelebirrSignature,
} from './utils/signing.util';

export interface TelebirrCallbackEvent {
  merchOrderId: string;
  tradeStatus: string;
  paymentOrderId?: string;
  transId?: string;
  totalAmount?: string;
  transCurrency?: string;
}

@Injectable()
export class TelebirrService {
  private readonly logger = new Logger(TelebirrService.name);

  constructor(
    @Inject(telebirrConfig.KEY)
    private readonly config: ConfigType<typeof telebirrConfig>,
    private readonly api: TelebirrApiClient,
    @InjectRepository(TelebirrTransaction)
    private readonly txRepo: Repository<TelebirrTransaction>,
    @InjectRepository(TelebirrApiLog)
    private readonly logRepo: Repository<TelebirrApiLog>,
    private readonly tokenCache: TelebirrTokenCache,
    private readonly webhook: PaymentWebhookService,
  ) {}

  async initiatePayment(
    applicationId: number,
    paymentInfoId: number,
    amount: number,
  ): Promise<TelebirrPaymentResultDto> {
    const currency = 'ETB';
    const title = `Application ${applicationId} Facility License Fee`;

    if (amount <= 0) {
      return TelebirrPaymentResultDto.failure(
        'AMOUNT_NOT_CONFIGURED',
        'Application fee is not configured.',
      );
    }

    const existingTx = await this.txRepo.findOne({
      where: { paymentInfoId, tradeStatus: TelebirrTransactionStatus.Pending },
      order: { initiatedAt: 'DESC' },
    });

    if (existingTx?.checkoutUrl) {
      const timeoutMinutes = this.extractTimeoutMinutes(
        this.config.timeoutExpress,
      );
      if (
        new Date() <=
        new Date(existingTx.initiatedAt.getTime() + timeoutMinutes * 60_000)
      ) {
        return {
          success: true,
          checkoutUrl: existingTx.checkoutUrl,
          merchOrderId: existingTx.merchOrderId,
          transactionId: existingTx.id,
          applicationId,
          amount: Number(existingTx.totalAmount).toFixed(2),
          isResume: true,
        };
      }
    }

    const merchOrderId = this.generateMerchOrderId(applicationId);
    const nonceStr = this.generateNonceStr();
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const amountStr = amount.toFixed(2);

    const bizContent: Record<string, string> = {
      notify_url: this.config.notifyUrl,
      appid: this.config.merchantAppId,
      merch_code: this.config.merchantCode,
      merch_order_id: merchOrderId,
      trade_type: 'Checkout',
      title,
      total_amount: amountStr,
      trans_currency: currency,
      timeout_express: this.config.timeoutExpress,
      redirect_url: `${this.config.redirectBaseUrl.replace(/\/$/, '')}/${applicationId}`,
    };

    const requestDict: Record<string, unknown> = {
      nonce_str: nonceStr,
      biz_content: bizContent,
      method: 'payment.preorder',
      version: '1.0',
      timestamp,
    };

    const sign = signTelebirrRequest(requestDict, this.config.privateKeyPem);
    const request = {
      ...requestDict,
      sign,
      sign_type: 'SHA256WithRSA',
    };

    const started = Date.now();
    try {
      const token = await this.tokenCache.getToken(() => this.fetchToken());
      const response = await this.api.createOrder(request, token);
      await this.logOutboundSafe(
        'preOrder',
        merchOrderId,
        request,
        response,
        200,
        response.code ?? 'SUCCESS',
        response.msg ?? null,
        Date.now() - started,
      );

      if (response.result !== 'SUCCESS' || response.code !== '0') {
        return TelebirrPaymentResultDto.failure(
          response.code ?? 'UNKNOWN',
          response.msg ?? 'Payment initiation failed. Please try again.',
        );
      }

      const prepayId = extractPrepayId(response);
      if (!prepayId) {
        return TelebirrPaymentResultDto.failure(
          'API_ERROR',
          'Payment gateway returned an unexpected response. Please try again.',
        );
      }

      const checkoutUrl = this.buildCheckoutUrl(prepayId);

      const tx = this.txRepo.create({
        paymentInfoId,
        applicationId,
        merchOrderId,
        tradeStatus: TelebirrTransactionStatus.Pending,
        totalAmount: amountStr,
        transCurrency: currency,
        title,
        prepayId,
        checkoutUrl,
        initiatedAt: new Date(),
      });
      await this.txRepo.save(tx);

      this.logger.log(
        `Telebirr payment initiated: AppId=${applicationId}, MerchOrderId=${merchOrderId}, TxId=${tx.id}`,
      );

      return {
        success: true,
        checkoutUrl,
        merchOrderId,
        transactionId: tx.id,
        applicationId,
        amount: amountStr,
      };
    } catch (err) {
      const httpStatus =
        err instanceof AxiosError && err.response?.status
          ? err.response.status
          : 0;
      const telebirrError = this.formatTelebirrApiError(err);
      await this.logOutboundSafe(
        'preOrder',
        merchOrderId,
        request,
        err instanceof AxiosError ? err.response?.data : null,
        httpStatus,
        'ERROR',
        telebirrError,
        Date.now() - started,
      );
      this.logger.error(
        err,
        `Telebirr preOrder failed for AppId=${applicationId}: ${telebirrError}`,
      );
      return TelebirrPaymentResultDto.failure(
        'API_ERROR',
        telebirrError,
      );
    }
  }

  async queryOrderStatus(
    merchOrderId: string,
  ): Promise<TelebirrQueryResultDto> {
    const nonceStr = this.generateNonceStr();
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const bizContent = {
      appid: this.config.merchantAppId,
      merch_code: this.config.merchantCode,
      merch_order_id: merchOrderId,
    };
    const requestDict: Record<string, unknown> = {
      nonce_str: nonceStr,
      biz_content: bizContent,
      method: 'payment.queryorder',
      version: '1.0',
      timestamp,
    };
    const sign = signTelebirrRequest(requestDict, this.config.privateKeyPem);
    const request = { ...requestDict, sign, sign_type: 'SHA256WithRSA' };

    try {
      const token = await this.tokenCache.getToken(() => this.fetchToken());
      const response = await this.api.queryOrder(request, token);

      if (response.result !== 'SUCCESS' || response.code !== '0') {
        return {
          success: false,
          errorMessage: response.msg ?? 'Order status query failed.',
        };
      }

      const fields = extractQueryFields(response);
      return {
        success: true,
        tradeStatus: fields.orderStatus,
        paymentOrderId: fields.paymentOrderId,
        transId: fields.transId,
        totalAmount: fields.totalAmount,
        transTime: fields.transTime,
      };
    } catch (err) {
      this.logger.error(err, `Telebirr queryOrder failed for ${merchOrderId}`);
      return {
        success: false,
        errorMessage: 'Failed to reach Telebirr payment gateway.',
      };
    }
  }

  async processCallback(evt: TelebirrCallbackEvent): Promise<void> {
    const tx = await this.txRepo.findOne({
      where: { merchOrderId: evt.merchOrderId },
    });
    if (!tx) {
      this.logger.warn(`Callback for unknown MerchOrderId ${evt.merchOrderId}`);
      return;
    }

    if (
      tx.tradeStatus === TelebirrTransactionStatus.Success ||
      tx.tradeStatus === TelebirrTransactionStatus.Failed
    ) {
      this.logger.log(
        `Callback for ${evt.merchOrderId} skipped - already ${tx.tradeStatus}`,
      );
      return;
    }

    if (evt.totalAmount) {
      const callbackAmount = parseFloat(evt.totalAmount);
      if (
        !Number.isNaN(callbackAmount) &&
        callbackAmount !== Number(tx.totalAmount)
      ) {
        this.logger.warn(
          `Amount mismatch for ${evt.merchOrderId}: callback=${callbackAmount}, tx=${tx.totalAmount}`,
        );
        return;
      }
    }

    const newStatus = this.mapCallbackStatus(evt.tradeStatus);
    if (!newStatus) {
      this.logger.log(
        `Callback for ${evt.merchOrderId} non-terminal status ${evt.tradeStatus} — ignored`,
      );
      return;
    }

    tx.tradeStatus = newStatus;
    tx.paymentOrderId = evt.paymentOrderId ?? null;
    tx.transId = evt.transId ?? null;
    tx.callbackReceivedAt = new Date();
    tx.modifiedDate = new Date();
    await this.txRepo.save(tx);

    if (newStatus === TelebirrTransactionStatus.Success) {
      await this.webhook.notifyPaymentSuccess({
        paymentInfoId: tx.paymentInfoId,
        applicationId: tx.applicationId,
        merchOrderId: tx.merchOrderId,
        provider: 'TELEBIRR',
        transId: tx.transId ?? undefined,
      });
    }

    this.logger.log(`Callback processed: ${evt.merchOrderId} -> ${newStatus}`);
  }

  verifyCallbackSignature(payload: TelebirrCallbackPayloadDto): boolean {
    if (!this.config.telebirrPublicKey || !payload.sign) return false;
    const signString = buildCallbackSignString(payload, { omitEmpty: false });
    return verifyTelebirrSignature(
      signString,
      payload.sign,
      this.config.telebirrPublicKey,
      'pss',
    );
  }

  async reconcileApplication(
    applicationId: number,
  ): Promise<TelebirrReconcileResultDto> {
    const tx = await this.txRepo.findOne({
      where: { applicationId },
      order: { initiatedAt: 'DESC' },
    });

    if (!tx) {
      return {
        found: false,
        message: 'No Telebirr transaction found for this application.',
      };
    }

    if (
      tx.tradeStatus === TelebirrTransactionStatus.Success ||
      tx.tradeStatus === TelebirrTransactionStatus.Failed ||
      tx.tradeStatus === TelebirrTransactionStatus.TimedOut
    ) {
      return {
        found: true,
        merchOrderId: tx.merchOrderId,
        tradeStatus: tx.tradeStatus,
        alreadyTerminal: true,
        message: 'Transaction already reconciled.',
      };
    }

    try {
      const statusBefore = tx.tradeStatus;
      await this.reconcileTransaction(tx);
      const refreshed = await this.txRepo.findOne({ where: { id: tx.id } });
      return {
        found: true,
        merchOrderId: tx.merchOrderId,
        tradeStatus: refreshed?.tradeStatus ?? statusBefore,
        alreadyTerminal: false,
        message: 'Reconciliation completed.',
      };
    } catch (err) {
      this.logger.error(
        err,
        `On-demand reconcile failed for AppId=${applicationId}`,
      );
      return {
        found: true,
        merchOrderId: tx.merchOrderId,
        tradeStatus: tx.tradeStatus,
        alreadyTerminal: false,
        message: `Reconciliation could not be completed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  async reconcilePendingTransactions(): Promise<void> {
    const cutoff = new Date(Date.now() - 30 * 60_000);
    const concurrencyWindow = 5 * 60_000;

    const pending = await this.txRepo
      .createQueryBuilder('t')
      .where('t.trade_status = :status', {
        status: TelebirrTransactionStatus.Pending,
      })
      .andWhere('t.initiated_at <= :cutoff', { cutoff })
      .andWhere('(t.reconciled_at IS NULL OR t.reconciled_at < :window)', {
        window: new Date(Date.now() - concurrencyWindow),
      })
      .getMany();

    if (pending.length === 0) return;

    this.logger.log(`Reconciliation: ${pending.length} pending transactions`);

    for (const tx of pending) {
      try {
        await this.reconcileTransaction(tx);
      } catch (err) {
        this.logger.error(err, `Error reconciling ${tx.merchOrderId}`);
      }
    }
  }

  async logInbound(
    apiMethod: string,
    merchOrderId: string | undefined,
    correlationId: string,
    payload: unknown,
    signatureValid: boolean,
    durationMs: number,
    error?: string | null,
  ): Promise<TelebirrApiLog> {
    const log = this.logRepo.create({
      direction: 'INBOUND',
      apiMethod,
      merchOrderId: merchOrderId ?? null,
      correlationId,
      requestPayload: JSON.stringify(payload),
      httpStatusCode: 200,
      signatureValid,
      processingStatus: signatureValid ? 'RECEIVED' : 'FAILED',
      processingError: error ?? null,
      durationMs,
      createdAt: new Date(),
    });
    return this.logRepo.save(log);
  }

  private async reconcileTransaction(tx: TelebirrTransaction): Promise<void> {
    tx.reconciledAt = new Date();
    tx.reconcileAttempts += 1;
    tx.modifiedDate = new Date();
    await this.txRepo.save(tx);

    const result = await this.queryOrderStatus(tx.merchOrderId);
    if (!result.success) return;

    const newStatus = this.mapOrderStatus(result.tradeStatus);
    if (newStatus) {
      tx.tradeStatus = newStatus;
      tx.paymentOrderId = result.paymentOrderId ?? null;
      tx.transId = result.transId ?? null;
      tx.modifiedDate = new Date();
      await this.txRepo.save(tx);

      if (newStatus === TelebirrTransactionStatus.Success) {
        await this.webhook.notifyPaymentSuccess({
          paymentInfoId: tx.paymentInfoId,
          applicationId: tx.applicationId,
          merchOrderId: tx.merchOrderId,
          provider: 'TELEBIRR',
          transId: tx.transId ?? undefined,
        });
      }

      this.logger.log(`Reconciliation: ${tx.merchOrderId} -> ${newStatus}`);
      return;
    }

    const timeoutMinutes = this.extractTimeoutMinutes(
      this.config.timeoutExpress,
    );
    if (Date.now() - tx.initiatedAt.getTime() > timeoutMinutes * 60_000) {
      tx.tradeStatus = TelebirrTransactionStatus.TimedOut;
      tx.modifiedDate = new Date();
      await this.txRepo.save(tx);
      this.logger.warn(`Reconciliation: ${tx.merchOrderId} timed out`);
    }
  }

  private mapCallbackStatus(status: string): string | null {
    switch (status) {
      case TelebirrCallbackStatus.Completed:
      case TelebirrCallbackStatus.Pending:
        return TelebirrTransactionStatus.Success;
      case TelebirrCallbackStatus.Failure:
        return TelebirrTransactionStatus.Failed;
      case TelebirrCallbackStatus.Expired:
        return TelebirrTransactionStatus.TimedOut;
      case TelebirrOrderStatus.PaySuccess:
        return TelebirrTransactionStatus.Success;
      case TelebirrOrderStatus.PayFailed:
        return TelebirrTransactionStatus.Failed;
      case TelebirrOrderStatus.OrderClosed:
        return TelebirrTransactionStatus.TimedOut;
      case TelebirrCallbackStatus.Paying:
        return null;
      default:
        return null;
    }
  }

  private mapOrderStatus(status?: string): string | null {
    switch (status) {
      case TelebirrOrderStatus.PaySuccess:
        return TelebirrTransactionStatus.Success;
      case TelebirrOrderStatus.PayFailed:
        return TelebirrTransactionStatus.Failed;
      case TelebirrOrderStatus.OrderClosed:
        return TelebirrTransactionStatus.TimedOut;
      default:
        return null;
    }
  }

  private buildCheckoutUrl(prepayId: string): string {
    return buildTelebirrCheckoutUrl({
      webBaseUrl: this.config.webBaseUrl,
      merchantAppId: this.config.merchantAppId,
      merchantCode: this.config.merchantCode,
      prepayId,
      nonceStr: this.generateNonceStr(),
      timestamp: Math.floor(Date.now() / 1000).toString(),
      privateKeyPem: this.config.privateKeyPem,
    });
  }

  private async fetchToken(): Promise<string> {
    const response = await this.api.getFabricToken();
    if (!response.token) {
      throw new Error('Telebirr fabric token response missing token');
    }

    if (response.effectiveDate && response.expirationDate) {
      const effective = this.parseTelebirrDate(response.effectiveDate);
      const expiry = this.parseTelebirrDate(response.expirationDate);
      if (effective && expiry) {
        const duration = expiry.getTime() - effective.getTime();
        if (duration > 0) {
          this.tokenCache.setWithExpiry(response.token, duration);
        }
      }
    }

    return response.token;
  }

  private parseTelebirrDate(value: string): Date | null {
    if (!/^\d{14}$/.test(value)) return null;
    const y = value.slice(0, 4);
    const m = value.slice(4, 6);
    const d = value.slice(6, 8);
    const h = value.slice(8, 10);
    const min = value.slice(10, 12);
    const s = value.slice(12, 14);
    return new Date(`${y}-${m}-${d}T${h}:${min}:${s}Z`);
  }

  private generateNonceStr(): string {
    const chars =
      '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    return Array.from({ length: 32 }, () =>
      chars.charAt(Math.floor(Math.random() * chars.length)),
    ).join('');
  }

  private generateMerchOrderId(applicationId: number): string {
    return `FL${applicationId}${uuidv4().replace(/-/g, '')}`;
  }

  private extractTimeoutMinutes(timeoutExpress: string): number {
    if (!timeoutExpress) return 120;
    const trimmed = timeoutExpress.replace(/m$/i, '');
    const minutes = parseInt(trimmed, 10);
    return Number.isFinite(minutes) ? minutes : 120;
  }

  private formatTelebirrApiError(err: unknown): string {
    if (err instanceof AxiosError) {
      const data = err.response?.data as
        | { errorMsg?: string; msg?: string; errorCode?: string }
        | undefined;
      if (data?.errorCode === '49401024991') {
        return 'Telebirr sandbox payment service is temporarily unavailable. Retry in a few minutes — this is on Telebirr’s side, not your integration.';
      }
      if (data?.errorCode === '60200099') {
        return 'Telebirr rejected the request signature. Check TELEBIRR_PRIVATE_KEY_PEM matches the public key registered on the developer portal.';
      }
      if (data?.errorMsg) return data.errorMsg;
      if (data?.msg) return data.msg;
      if (err.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') {
        return 'TLS certificate verification failed. Set TELEBIRR_ALLOW_INSECURE_TLS=true for sandbox.';
      }
    }
    return 'Failed to reach Telebirr payment gateway. Please try again.';
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
      this.logger.warn(err, `Failed to log outbound ${method}`);
    }
  }
}
