import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { Inject } from '@nestjs/common';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import ethswitchConfig from '../config/ethswitch.config';
import {
  LoginRequestDto,
  LoginResponseDto,
  OrderRequestDto,
  OrderResponseDto,
} from './dto/ethswitch.dto';
import { toSnakeCaseKeys } from '../common/utils/snake-case';
import { normalizeOrderResponse } from './utils/normalize-gateway-response';
import { EthSwitchTokenCache } from './token-cache.service';

/** Mirrors FL.Services.Payment.EthSwitch.IEthSwitchApi (Refit) */
@Injectable()
export class EthSwitchApiClient {
  private readonly logger = new Logger(EthSwitchApiClient.name);

  constructor(
    private readonly http: HttpService,
    @Inject(ethswitchConfig.KEY)
    private readonly config: ConfigType<typeof ethswitchConfig>,
    private readonly tokenCache: EthSwitchTokenCache,
  ) {}

  async authenticate(request: LoginRequestDto): Promise<LoginResponseDto> {
    const base = this.config.baseUrl.replace(/\/$/, '');
    const { data } = await firstValueFrom(
      this.http.post<LoginResponseDto>(
        `${base}/user/auth/login`,
        toSnakeCaseKeys(request),
      ),
    );
    return data;
  }

  async registerOrder(
    request: OrderRequestDto,
    token: string,
  ): Promise<OrderResponseDto> {
    const base = this.config.baseUrl.replace(/\/$/, '');
    const correlationId = uuidv4().replace(/-/g, '');

    try {
      const { data } = await firstValueFrom(
        this.http.post<Record<string, unknown>>(
          `${base}/nbg/api/v1/payment/order/handle`,
          toSnakeCaseKeys(request),
          {
            params: { action: 'order.create' },
            headers: {
              Authorization: `Bearer ${token}`,
              'X-Correlation-ID': correlationId,
              'X-Biller-BIN': this.config.billerBin,
              Accept: 'application/json',
              'Content-Type': 'application/json',
            },
          },
        ),
      );
      return normalizeOrderResponse(data);
    } catch (err) {
      if (err instanceof AxiosError && err.response?.status === 401) {
        this.tokenCache.invalidate();
      }
      throw err;
    }
  }
}
