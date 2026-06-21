import { HttpService } from '@nestjs/axios';
import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import telebirrConfig from '../config/telebirr.config';
import { toSnakeCaseKeys } from '../common/utils/snake-case';
import {
  TelebirrPreOrderResponse,
  TelebirrQueryResponse,
  TelebirrTokenResponse,
} from './dto/telebirr.dto';
import { normalizeFabricAuthHeader } from './utils/fabric-auth.util';
import { TelebirrTokenCache } from './token-cache.service';

@Injectable()
export class TelebirrApiClient {
  constructor(
    private readonly http: HttpService,
    @Inject(telebirrConfig.KEY)
    private readonly config: ConfigType<typeof telebirrConfig>,
    private readonly tokenCache: TelebirrTokenCache,
  ) {}

  async getFabricToken(): Promise<TelebirrTokenResponse> {
    const base = this.config.baseUrl.replace(/\/$/, '');
    const { data } = await firstValueFrom(
      this.http.post<TelebirrTokenResponse>(
        `${base}/payment/v1/token`,
        { appSecret: this.config.appSecret },
        { headers: { 'X-APP-Key': this.config.fabricAppId } },
      ),
    );
    return data;
  }

  async createOrder(
    body: Record<string, unknown>,
    token: string,
  ): Promise<TelebirrPreOrderResponse> {
    return this.postMerchant<TelebirrPreOrderResponse>(
      '/payment/v1/merchant/preOrder',
      body,
      token,
    );
  }

  async queryOrder(
    body: Record<string, unknown>,
    token: string,
  ): Promise<TelebirrQueryResponse> {
    return this.postMerchant<TelebirrQueryResponse>(
      '/payment/v1/merchant/queryOrder',
      body,
      token,
    );
  }

  private async postMerchant<T>(
    path: string,
    body: Record<string, unknown>,
    token: string,
  ): Promise<T> {
    const base = this.config.baseUrl.replace(/\/$/, '');
    try {
      const { data } = await firstValueFrom(
        this.http.post<T>(`${base}${path}`, toSnakeCaseKeys(body), {
          headers: {
            'X-APP-Key': this.config.fabricAppId,
            Authorization: normalizeFabricAuthHeader(token),
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
        }),
      );
      return data;
    } catch (err) {
      if (err instanceof AxiosError && err.response?.status === 401) {
        this.tokenCache.invalidate();
      }
      throw err;
    }
  }
}
