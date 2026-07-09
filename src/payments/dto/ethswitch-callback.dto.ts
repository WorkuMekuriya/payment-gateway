import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class EthSwitchCallbackBillInfoDto {
  @ApiPropertyOptional({ example: 'ETB' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ example: 500.0 })
  @IsOptional()
  @IsNumber()
  amountDue?: number;

  @ApiPropertyOptional({ example: 500.0 })
  @IsOptional()
  @IsNumber()
  totalAmount?: number;
}

export class EthSwitchCallbackDataDto {
  @ApiPropertyOptional({ example: 'bp-req-001' })
  @IsOptional()
  @IsString()
  bill_payment_request_id?: string;

  @ApiProperty({
    example: 'FL12345a1b2c3d4e5f6',
    description: 'Merchant order id used as transaction reference',
  })
  @IsNotEmpty()
  @IsString()
  request_id: string;

  @ApiPropertyOptional({ example: 'PAID' })
  @IsOptional()
  @IsString()
  current_status?: string;

  @ApiPropertyOptional({ type: EthSwitchCallbackBillInfoDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => EthSwitchCallbackBillInfoDto)
  bill_info?: EthSwitchCallbackBillInfoDto;
}

/** Validated EthSwitch NGB callback payload. */
export class EthSwitchCallbackDto {
  @ApiPropertyOptional({ example: 'PAID', enum: ['PAID', 'FAILED'] })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ example: 'PAID' })
  @IsOptional()
  @IsString()
  current_status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  message?: string;

  @ApiPropertyOptional({ example: 'txn-abc-123' })
  @IsOptional()
  @IsString()
  transaction_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  correlation_id?: string;

  @ApiProperty({ type: EthSwitchCallbackDataDto })
  @IsNotEmpty({ message: 'data is required' })
  @ValidateNested()
  @Type(() => EthSwitchCallbackDataDto)
  data: EthSwitchCallbackDataDto;
}
