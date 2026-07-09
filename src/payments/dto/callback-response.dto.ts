import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Standard acknowledgement returned to EthSwitch after callback processing. */
export class EthSwitchCallbackResponseDto {
  @ApiProperty({ example: 'SUCCESS' })
  code: string;

  @ApiPropertyOptional({ example: 'Callback processed successfully.' })
  message?: string;
}
