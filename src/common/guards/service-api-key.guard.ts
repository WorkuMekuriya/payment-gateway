import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { Request } from 'express';
import paymentConfig from '../../config/payment.config';

@Injectable()
export class ServiceApiKeyGuard implements CanActivate {
  constructor(
    @Inject(paymentConfig.KEY)
    private readonly config: ConfigType<typeof paymentConfig>,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.serviceApiKey;
    if (!expected) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const provided =
      req.headers['x-api-key'] ??
      req.headers.authorization?.replace(/^Bearer\s+/i, '');

    if (!provided || provided !== expected) {
      throw new UnauthorizedException('Invalid or missing service API key');
    }
    return true;
  }
}
