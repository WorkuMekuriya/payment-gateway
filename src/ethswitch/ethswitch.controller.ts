import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiExcludeEndpoint,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { ApiResponseDto, InitiatePaymentDto } from '../common/dto/payment.dto';
import { ServiceApiKeyGuard } from '../common/guards/service-api-key.guard';
import { EthSwitchService } from './ethswitch.service';

@ApiTags('EthSwitch')
@Controller('api/ethswitch')
export class EthSwitchController {
  constructor(private readonly ethSwitchService: EthSwitchService) {}

  @Post('initiate/:applicationId')
  @UseGuards(ServiceApiKeyGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiBearerAuth('bearer-service-key')
  @ApiOperation({
    summary: 'Initiate or resume a hosted EthSwitch payment',
    description:
      'Creates an NGB order (or resumes a live pending checkout URL). Rate limited to 10 requests/min.',
  })
  @ApiParam({ name: 'applicationId', type: Number, example: 12345 })
  @ApiResponse({ status: 200, description: 'Payment initiated or resumed' })
  @ApiResponse({
    status: 401,
    description: 'Invalid or missing service API key',
  })
  async initiatePayment(
    @Param('applicationId', ParseIntPipe) applicationId: number,
    @Body() body: InitiatePaymentDto,
  ): Promise<ApiResponseDto> {
    const result = await this.ethSwitchService.initiatePayment(
      applicationId,
      body,
    );
    if (!result.success) {
      return ApiResponseDto.error(
        result.errorMessage ?? 'Payment initiation failed.',
      );
    }
    return ApiResponseDto.success('Payment initiated successfully.', result);
  }

  @Get('cancel')
  @ApiExcludeEndpoint()
  async cancel(
    @Query('merchOrderId') merchOrderId: string,
    @Res() res: Response,
  ): Promise<void> {
    const applicationId =
      await this.ethSwitchService.cancelPayment(merchOrderId);
    res.redirect(
      this.ethSwitchService.buildApplicationDetailUrl(applicationId),
    );
  }
}
