import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
} from 'class-validator';

export class InitiatePaymentDto {
  @ApiProperty({ example: 123 })
  @IsInt()
  @IsPositive()
  paymentInfoId: number;

  @ApiProperty({ example: 500.0 })
  @IsNumber()
  @Min(0.01)
  amount: number;

  @ApiPropertyOptional({ example: 'ETB', default: 'ETB' })
  @IsOptional()
  @IsString()
  currency?: string;
}

export class ApiResponseDto<T = unknown> {
  @ApiProperty()
  success: boolean;

  @ApiProperty()
  message: string;

  @ApiPropertyOptional()
  data?: T;

  static success<T>(message: string, data?: T): ApiResponseDto<T> {
    return { success: true, message, data };
  }

  static error(message: string): ApiResponseDto {
    return { success: false, message };
  }
}

export class PaymentSuccessWebhookDto {
  paymentInfoId: number;
  applicationId: number;
  merchOrderId: string;
  provider: 'ETHSWITCH' | 'TELEBIRR';
  transId?: string;
}
