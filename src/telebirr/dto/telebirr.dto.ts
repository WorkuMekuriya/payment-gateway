import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TelebirrPaymentResultDto {
  @ApiProperty()
  success: boolean;

  @ApiPropertyOptional()
  errorCode?: string;

  @ApiPropertyOptional()
  errorMessage?: string;

  @ApiPropertyOptional()
  checkoutUrl?: string;

  @ApiPropertyOptional()
  merchOrderId?: string;

  @ApiPropertyOptional()
  transactionId?: number;

  @ApiPropertyOptional()
  applicationId?: number;

  @ApiPropertyOptional()
  amount?: string;

  @ApiPropertyOptional()
  isResume?: boolean;

  static failure(code: string, message: string): TelebirrPaymentResultDto {
    return { success: false, errorCode: code, errorMessage: message };
  }
}

export class TelebirrReconcileResultDto {
  found: boolean;
  merchOrderId?: string;
  tradeStatus?: string;
  alreadyTerminal?: boolean;
  message?: string;
}

export class TelebirrQueryResultDto {
  success: boolean;
  errorMessage?: string;
  tradeStatus?: string;
  paymentOrderId?: string;
  transId?: string;
  totalAmount?: string;
  transTime?: string;
}

export interface TelebirrPreOrderResponse {
  result?: string;
  code?: string;
  msg?: string;
  biz_content?: {
    merch_order_id?: string;
    prepay_id?: string;
    merchOrderId?: string;
    prepayId?: string;
  };
  bizContent?: {
    merch_order_id?: string;
    prepay_id?: string;
    merchOrderId?: string;
    prepayId?: string;
  };
}

export interface TelebirrQueryResponse {
  result?: string;
  code?: string;
  msg?: string;
  biz_content?: {
    order_status?: string;
    payment_order_id?: string;
    trans_id?: string;
    total_amount?: string;
    trans_time?: string;
  };
  bizContent?: {
    orderStatus?: string;
    paymentOrderId?: string;
    transId?: string;
    totalAmount?: string;
    transTime?: string;
  };
}

export interface TelebirrTokenResponse {
  token?: string;
  effectiveDate?: string;
  expirationDate?: string;
}

export function extractPrepayId(
  response: TelebirrPreOrderResponse,
): string | undefined {
  const biz = response.biz_content ?? response.bizContent;
  if (!biz) return undefined;
  const b = biz as Record<string, string | undefined>;
  return b.prepay_id ?? b.prepayId;
}

export function extractQueryFields(response: TelebirrQueryResponse) {
  const biz = response.biz_content ?? response.bizContent;
  if (!biz) return {};
  const b = biz as Record<string, string | undefined>;
  return {
    orderStatus: b.order_status ?? b.orderStatus,
    paymentOrderId: b.payment_order_id ?? b.paymentOrderId,
    transId: b.trans_id ?? b.transId,
    totalAmount: b.total_amount ?? b.totalAmount,
    transTime: b.trans_time ?? b.transTime,
  };
}
