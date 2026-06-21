import {
  Body,
  Controller,
  Get,
  Logger,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiBearerAuth,
  ApiExcludeEndpoint,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import {
  ApiResponseDto,
  CallbackPayloadDto,
  EthSwitchPaymentResultDto,
  InitiatePaymentDto,
} from './dto/ethswitch.dto';
import { EthSwitchService } from './ethswitch.service';
import { ServiceApiKeyGuard } from './guards/service-api-key.guard';

/** Port of FL.API.Controllers.Payment.EthSwitchController */
@ApiTags('EthSwitch')
@Controller('api/ethswitch')
export class EthSwitchController {
  private readonly logger = new Logger(EthSwitchController.name);

  constructor(private readonly ethSwitchService: EthSwitchService) {}

  @Post('initiate/:applicationId')
  @UseGuards(ServiceApiKeyGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiSecurity('service-api-key')
  @ApiBearerAuth('bearer-service-key')
  @ApiHeader({
    name: 'x-api-key',
    description: 'SERVICE_API_KEY from environment',
    required: true,
  })
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

  @Post('callback')
  @ApiOperation({
    summary: 'EthSwitch gateway completion callback',
    description:
      'Called by the NGB gateway on payment completion. Always returns `{ code: "SUCCESS" }`.',
  })
  @ApiBody({ type: CallbackPayloadDto })
  @ApiResponse({
    status: 200,
    schema: { example: { code: 'SUCCESS' } },
  })
  async callback(
    @Req() req: Request & { rawBody?: Buffer },
  ): Promise<{ code: string }> {
    const started = Date.now();
    const rawBody =
      req.rawBody?.toString('utf8') ??
      (typeof req.body === 'string'
        ? req.body
        : req.body && Object.keys(req.body).length
          ? JSON.stringify(req.body)
          : '');

    let payload: CallbackPayloadDto | null = null;
    let deserializationError: string | null = null;

    try {
      payload = rawBody?.trim()
        ? (JSON.parse(rawBody) as CallbackPayloadDto)
        : null;
    } catch (err) {
      deserializationError = `JSON deserialization failed: ${err instanceof Error ? err.message : String(err)}`;
      this.logger.warn(
        `EthSwitch callback body could not be deserialized. Raw length=${rawBody?.length ?? 0}.`,
      );
    }

    const correlationId =
      (req.headers['x-correlation-id'] as string | undefined) ??
      payload?.correlation_id ??
      uuidv4().replace(/-/g, '');

    await this.ethSwitchService.logInbound(
      'callback',
      payload?.data?.request_id,
      correlationId,
      payload ?? { rawBody, error: deserializationError },
      Date.now() - started,
      deserializationError,
    );

    if (payload) {
      await this.ethSwitchService.processCallback(payload);
    }

    this.logger.log(
      `EthSwitch callback received for ${payload?.data?.request_id}: status=${payload?.status}, duration=${Date.now() - started}ms`,
    );

    return { code: 'SUCCESS' };
  }
}
