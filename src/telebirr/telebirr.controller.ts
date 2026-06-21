import {
  Body,
  Controller,
  Get,
  Inject,
  Logger,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { ApiResponseDto, InitiatePaymentDto } from '../common/dto/payment.dto';
import { ServiceApiKeyGuard } from '../common/guards/service-api-key.guard';
import telebirrConfig from '../config/telebirr.config';
import { TelebirrPaymentResultDto } from './dto/telebirr.dto';
import { TelebirrService } from './telebirr.service';
import {
  TelebirrCallbackPayloadDto,
  verifyRedirectCallbackSignature,
} from './utils/signing.util';

@ApiTags('Telebirr')
@Controller('api/telebirr')
export class TelebirrController {
  private readonly logger = new Logger(TelebirrController.name);

  constructor(
    private readonly telebirrService: TelebirrService,
    @Inject(telebirrConfig.KEY)
    private readonly config: ConfigType<typeof telebirrConfig>,
  ) {}

  @Post('initiate/:applicationId')
  @UseGuards(ServiceApiKeyGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiBearerAuth('bearer-service-key')
  @ApiOperation({ summary: 'Initiate or resume a Telebirr hosted checkout' })
  @ApiParam({ name: 'applicationId', type: Number })
  async initiatePayment(
    @Param('applicationId', ParseIntPipe) applicationId: number,
    @Body() body: InitiatePaymentDto,
  ): Promise<ApiResponseDto> {
    const result = await this.telebirrService.initiatePayment(
      applicationId,
      body.paymentInfoId,
      body.amount,
    );
    if (!result.success) {
      return ApiResponseDto.error(
        result.errorMessage ?? 'Payment initiation failed.',
      );
    }
    return ApiResponseDto.success('Payment initiated successfully.', result);
  }

  @Post('callback')
  @ApiOperation({ summary: 'Telebirr server-to-server notify callback' })
  @ApiBody({ schema: { type: 'object' } })
  async callback(
    @Req() req: Request & { rawBody?: Buffer },
  ): Promise<{ code: string }> {
    const started = Date.now();
    const payload = this.parseCallbackBody(req);
    const correlationId =
      (req.headers['x-correlation-id'] as string | undefined) ??
      uuidv4().replace(/-/g, '');

    const signVerified = this.telebirrService.verifyCallbackSignature(payload);

    await this.telebirrService.logInbound(
      'callback',
      payload.merch_order_id,
      correlationId,
      payload,
      signVerified,
      Date.now() - started,
      signVerified ? null : 'Signature verification failed',
    );

    if (signVerified && payload.merch_order_id) {
      await this.telebirrService.processCallback({
        merchOrderId: payload.merch_order_id,
        tradeStatus: payload.trade_status ?? '',
        paymentOrderId: payload.payment_order_id,
        transId: payload.trans_id,
        totalAmount: payload.total_amount,
        transCurrency: payload.trans_currency,
      });
    } else if (!signVerified) {
      this.logger.warn(
        `Telebirr callback signature FAILED for ${payload.merch_order_id}`,
      );
    }

    return { code: signVerified ? 'SUCCESS' : 'FAIL' };
  }

  @Post('redirect-callback')
  @UseGuards(ServiceApiKeyGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiBearerAuth('bearer-service-key')
  @ApiOperation({
    summary:
      'Browser redirect callback (signed query params forwarded as JSON)',
  })
  async redirectCallback(
    @Req() req: Request & { rawBody?: Buffer },
  ): Promise<ApiResponseDto> {
    const started = Date.now();
    const payload = this.parseCallbackBody(req);
    const correlationId =
      (req.headers['x-correlation-id'] as string | undefined) ??
      uuidv4().replace(/-/g, '');

    let signVerified = verifyRedirectCallbackSignature(
      payload,
      this.config.telebirrPublicKey,
    ).verified;
    let variant = signVerified ? 'matched' : undefined;

    if (!signVerified && this.config.allowDevSignatureBypass) {
      this.logger.warn(
        `DEVELOPMENT-ONLY: bypassing failed redirect signature for ${payload.merch_order_id}`,
      );
      signVerified = true;
      variant = 'dev-bypass';
    }

    await this.telebirrService.logInbound(
      'redirect-callback',
      payload.merch_order_id,
      correlationId,
      payload,
      signVerified,
      Date.now() - started,
      signVerified ? null : 'Signature verification failed',
    );

    if (!signVerified) {
      return ApiResponseDto.error('Signature verification failed.');
    }

    if (payload.merch_order_id) {
      await this.telebirrService.processCallback({
        merchOrderId: payload.merch_order_id,
        tradeStatus: payload.trade_status ?? '',
        paymentOrderId: payload.payment_order_id,
        transId: payload.trans_id,
        totalAmount: payload.total_amount,
        transCurrency: payload.trans_currency,
      });
    }

    this.logger.log(
      `Redirect-callback processed for ${payload.merch_order_id} (${variant})`,
    );

    return ApiResponseDto.success('Redirect callback processed.', {
      merchOrderId: payload.merch_order_id,
      tradeStatus: payload.trade_status,
    });
  }

  @Post('reconcile/:applicationId')
  @UseGuards(ServiceApiKeyGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiBearerAuth('bearer-service-key')
  @ApiOperation({
    summary:
      'On-demand reconcile via queryorder (local dev / lost callback safety net)',
  })
  async reconcile(
    @Param('applicationId', ParseIntPipe) applicationId: number,
  ): Promise<ApiResponseDto> {
    const result =
      await this.telebirrService.reconcileApplication(applicationId);
    return ApiResponseDto.success(result.message ?? 'OK', result);
  }

  @Get('status/:merchOrderId')
  @UseGuards(ServiceApiKeyGuard)
  @ApiBearerAuth('bearer-service-key')
  @ApiOperation({ summary: 'Query Telebirr order status (admin/diagnostic)' })
  async queryStatus(
    @Param('merchOrderId') merchOrderId: string,
  ): Promise<ApiResponseDto> {
    const result = await this.telebirrService.queryOrderStatus(merchOrderId);
    if (!result.success) {
      return ApiResponseDto.error(result.errorMessage ?? 'Query failed.');
    }
    return ApiResponseDto.success('OK', result);
  }

  private parseCallbackBody(
    req: Request & { rawBody?: Buffer },
  ): TelebirrCallbackPayloadDto {
    const rawBody =
      req.rawBody?.toString('utf8') ??
      (typeof req.body === 'string'
        ? req.body
        : req.body && Object.keys(req.body).length
          ? JSON.stringify(req.body)
          : '');

    try {
      return rawBody?.trim()
        ? (JSON.parse(rawBody) as TelebirrCallbackPayloadDto)
        : ((req.body as TelebirrCallbackPayloadDto) ?? {});
    } catch {
      return (req.body as TelebirrCallbackPayloadDto) ?? {};
    }
  }
}
