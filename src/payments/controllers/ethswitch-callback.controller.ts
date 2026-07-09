import {
  Controller,
  HttpCode,
  HttpStatus,
  InternalServerErrorException,
  Logger,
  Post,
  Req,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { EthSwitchCallbackResponseDto } from '../dto/callback-response.dto';
import { EthSwitchCallbackDto } from '../dto/ethswitch-callback.dto';
import { CallbackProcessingOutcome } from '../interfaces/callback-handle-result.interface';
import { EthSwitchCallbackService } from '../services/ethswitch-callback.service';

/**
 * Public EthSwitch payment callback endpoint.
 *
 * No JWT or service API key — authenticity is enforced by
 * {@link EthSwitchCallbackVerifier} (HMAC, Basic Auth, IP allowlist).
 */
@ApiTags('Payments')
@Controller('api/v1/payments')
export class EthSwitchCallbackController {
  private readonly logger = new Logger(EthSwitchCallbackController.name);

  constructor(
    private readonly ethSwitchCallbackService: EthSwitchCallbackService,
  ) {}

  @Post('ethswitch/callback')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'EthSwitch payment callback (public)',
    description:
      'Receives payment completion notifications from EthSwitch NGB. ' +
      'Secured via HMAC signature, Basic Auth, and/or IP allowlist — not JWT. ' +
      'Idempotent: duplicate successful callbacks return HTTP 200 without re-processing.',
  })
  @ApiBody({ type: EthSwitchCallbackDto })
  @ApiResponse({
    status: 200,
    description: 'Callback processed or acknowledged as duplicate',
    type: EthSwitchCallbackResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid callback payload' })
  @ApiResponse({ status: 401, description: 'Callback verification failed' })
  @ApiResponse({ status: 500, description: 'Unexpected server error' })
  async handleCallback(
    @Req() req: Request & { rawBody?: Buffer },
  ): Promise<EthSwitchCallbackResponseDto> {
    const result = await this.ethSwitchCallbackService.handleCallback(req);

    this.logger.debug(
      `EthSwitch callback outcome=${result.outcome}, ref=${result.transactionReference ?? 'n/a'}`,
    );

    switch (result.outcome) {
      case CallbackProcessingOutcome.INVALID_PAYLOAD:
        throw new BadRequestException(result.message);

      case CallbackProcessingOutcome.VERIFICATION_FAILED:
        throw new UnauthorizedException(result.message);

      case CallbackProcessingOutcome.INTERNAL_ERROR:
        throw new InternalServerErrorException(result.message);

      case CallbackProcessingOutcome.DUPLICATE:
      case CallbackProcessingOutcome.PROCESSED:
      default:
        return {
          code: 'SUCCESS',
          message: result.message,
        };
    }
  }
}
