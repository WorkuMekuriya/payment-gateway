import { createHmac, timingSafeEqual } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { Inject } from '@nestjs/common';
import ethswitchConfig from '../../config/ethswitch.config';
import {
  CallbackVerificationContext,
  ICallbackVerifier,
} from '../interfaces/callback-verifier.interface';

/**
 * EthSwitch callback authenticity verification.
 *
 * Checks (in order, all configured checks must pass):
 * 1. IP allowlist — ETHSWITCH_ALLOWED_IPS (comma-separated CIDR-less IPs)
 * 2. HMAC-SHA256 — ETHSWITCH_CALLBACK_SECRET + x-ethswitch-signature header
 * 3. Basic Auth — ETHSWITCH_CALLBACK_USERNAME / ETHSWITCH_CALLBACK_PASSWORD
 *
 * When no security env vars are set, verification passes (dev/UAT parity with
 * legacy behaviour). Configure at least one mechanism in production.
 */
@Injectable()
export class EthSwitchCallbackVerifier implements ICallbackVerifier {
  private readonly logger = new Logger(EthSwitchCallbackVerifier.name);

  constructor(
    @Inject(ethswitchConfig.KEY)
    private readonly config: ConfigType<typeof ethswitchConfig>,
  ) {}

  async verify(context: CallbackVerificationContext): Promise<boolean> {
    const checks: Array<{ name: string; enabled: boolean; pass: boolean }> =
      [];

    // 1. IP allowlist
    if (this.config.allowedIps.length > 0) {
      const ipAllowed = this.config.allowedIps.includes(context.sourceIp);
      checks.push({ name: 'ip_allowlist', enabled: true, pass: ipAllowed });
      if (!ipAllowed) {
        this.logger.warn(
          `EthSwitch callback rejected: source IP ${context.sourceIp} not in allowlist`,
        );
        return false;
      }
    }

    // 2. HMAC signature (header: x-ethswitch-signature or x-signature)
    if (this.config.callbackSecret) {
      const signature = this.extractSignatureHeader(context.headers);
      const hmacValid = this.verifyHmac(context.rawBody, signature);
      checks.push({ name: 'hmac', enabled: true, pass: hmacValid });
      if (!hmacValid) {
        this.logger.warn('EthSwitch callback HMAC verification failed');
        return false;
      }
    }

    // 3. HTTP Basic Auth
    if (this.config.callbackUsername && this.config.callbackPassword) {
      const basicValid = this.verifyBasicAuth(context.headers);
      checks.push({ name: 'basic_auth', enabled: true, pass: basicValid });
      if (!basicValid) {
        this.logger.warn('EthSwitch callback Basic Auth verification failed');
        return false;
      }
    }

    if (checks.length === 0) {
      this.logger.debug(
        'EthSwitch callback verification skipped — no ETHSWITCH_CALLBACK_* security configured',
      );
    }

    return true;
  }

  private extractSignatureHeader(
    headers: Record<string, string | string[] | undefined>,
  ): string | null {
    const raw =
      headers['x-ethswitch-signature'] ??
      headers['x-signature'] ??
      headers['x-hmac-signature'];
    if (!raw) return null;
    return Array.isArray(raw) ? raw[0] : raw;
  }

  private verifyHmac(rawBody: string, providedSignature: string | null): boolean {
    if (!providedSignature?.trim() || !this.config.callbackSecret) {
      return false;
    }

    const expected = createHmac('sha256', this.config.callbackSecret)
      .update(rawBody, 'utf8')
      .digest('hex');

    const normalized = providedSignature
      .trim()
      .replace(/^sha256=/i, '')
      .toLowerCase();

    try {
      const expectedBuf = Buffer.from(expected, 'hex');
      const providedBuf = Buffer.from(normalized, 'hex');
      if (expectedBuf.length !== providedBuf.length) {
        return false;
      }
      return timingSafeEqual(expectedBuf, providedBuf);
    } catch {
      return false;
    }
  }

  private verifyBasicAuth(
    headers: Record<string, string | string[] | undefined>,
  ): boolean {
    const authHeader = headers.authorization;
    const raw = Array.isArray(authHeader) ? authHeader[0] : authHeader;
    if (!raw?.startsWith('Basic ')) {
      return false;
    }

    try {
      const decoded = Buffer.from(raw.slice(6), 'base64').toString('utf8');
      const separator = decoded.indexOf(':');
      if (separator < 0) return false;
      const username = decoded.slice(0, separator);
      const password = decoded.slice(separator + 1);
      return (
        username === this.config.callbackUsername &&
        password === this.config.callbackPassword
      );
    } catch {
      return false;
    }
  }
}
