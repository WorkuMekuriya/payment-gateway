import { Injectable } from '@nestjs/common';

/** Mirrors FL.Services.Payment.EthSwitch.EthSwitchTokenCache */
@Injectable()
export class EthSwitchTokenCache {
  private static readonly cacheKey = 'EthSwitchBearerToken';
  private readonly store = new Map<
    string,
    { token: string; expiresAt: number }
  >();

  async getToken(fetchAsync: () => Promise<string>): Promise<string> {
    const cached = this.store.get(EthSwitchTokenCache.cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.token;
    }

    const token = await fetchAsync();
    if (!this.store.has(EthSwitchTokenCache.cacheKey)) {
      this.setWithExpiry(token, 55 * 60 * 1000);
    }
    return token;
  }

  setWithExpiry(token: string, durationMs: number): void {
    const cacheDuration = Math.floor(durationMs * 0.9);
    this.store.set(EthSwitchTokenCache.cacheKey, {
      token,
      expiresAt: Date.now() + cacheDuration,
    });
  }

  invalidate(): void {
    this.store.delete(EthSwitchTokenCache.cacheKey);
  }
}
