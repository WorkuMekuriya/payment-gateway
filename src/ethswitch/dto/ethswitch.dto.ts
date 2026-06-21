import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LoginRequestDto {
  username: string;
  password: string;
}

export class LoginResponseDto {
  access_token?: string;
  expires_in?: number;
}

export class OrderLineItemDto {
  itemName: string;
  quantity: number;
  unitPrice: number;
  totalUsageAmount: number;
}

export class OrderRequestDto {
  amount: number;
  currency: string;
  merchantOrderNumber: string;
  pnr?: string;
  idempotencyKey: string;
  description: string;
  successUrl: string;
  cancelUrl: string;
  callbackUrl: string;
  lineItems: OrderLineItemDto[];
}

export class OrderResponseDto {
  orderReference?: string;
  hppUrl?: string;
  hppToken?: string;
  expiresAt?: string;
  billerName?: string;
  merchantOrderNumber?: string;
  amount?: number;
  currency?: string;
}

export class CallbackBillInfoDto {
  @ApiPropertyOptional({ example: 'ETB' })
  currency?: string;

  @ApiPropertyOptional({ example: 500.0 })
  amountDue?: number;

  @ApiPropertyOptional({ example: 500.0 })
  totalAmount?: number;
}

export class CallbackDataDto {
  @ApiPropertyOptional({ example: 'bp-req-001' })
  bill_payment_request_id?: string;

  @ApiPropertyOptional({
    example: 'FL12345a1b2c3d4e5f6',
    description: 'Merchant order id (our merch_order_id)',
  })
  request_id?: string;

  @ApiPropertyOptional({ example: 'PAID' })
  current_status?: string;

  @ApiPropertyOptional({ type: CallbackBillInfoDto })
  bill_info?: CallbackBillInfoDto;
}

export class CallbackPayloadDto {
  @ApiPropertyOptional({ example: 'PAID', enum: ['PAID', 'FAILED'] })
  status?: string;

  @ApiPropertyOptional({ example: 'PAID' })
  current_status?: string;

  @ApiPropertyOptional()
  message?: string;

  @ApiPropertyOptional({ example: 'txn-abc-123' })
  transaction_id?: string;

  @ApiPropertyOptional()
  correlation_id?: string;

  @ApiPropertyOptional()
  http_status?: number;

  @ApiPropertyOptional({ type: CallbackDataDto })
  data?: CallbackDataDto;
}

export class EthSwitchPaymentResultDto {
  @ApiProperty()
  success: boolean;

  @ApiPropertyOptional()
  errorCode?: string;

  @ApiPropertyOptional()
  errorMessage?: string;

  @ApiPropertyOptional({ description: 'Hosted payment page URL' })
  checkoutUrl?: string;

  @ApiPropertyOptional()
  merchOrderId?: string;

  @ApiPropertyOptional()
  transactionId?: number;

  @ApiPropertyOptional()
  applicationId?: number;

  @ApiPropertyOptional({ example: '1.00' })
  amount?: string;

  @ApiPropertyOptional({
    description: 'True when an existing live checkout URL was reused',
  })
  isResume?: boolean;

  static failure(code: string, message: string): EthSwitchPaymentResultDto {
    return { success: false, errorCode: code, errorMessage: message };
  }
}
