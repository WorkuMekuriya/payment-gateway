import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { Inject } from '@nestjs/common';
import { Request } from 'express';
import ethswitchConfig from '../../config/ethswitch.config';

/** Optional API-key guard for initiate (replaces RequireApplicantRights at the BFF/monolith layer). */
@Injectable()
export class ServiceApiKeyGuard implements CanActivate {
  constructor(
    @Inject(ethswitchConfig.KEY)
    private readonly config: ConfigType<typeof ethswitchConfig>,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.serviceApiKey?.trim();
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
