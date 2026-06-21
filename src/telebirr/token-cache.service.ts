import { Injectable } from '@nestjs/common';

@Injectable()
export class TelebirrTokenCache {
  private static readonly cacheKey = 'TelebirrFabricToken';
  private readonly store = new Map<
    string,
    { token: string; expiresAt: number }
  >();

  async getToken(fetchAsync: () => Promise<string>): Promise<string> {
    const cached = this.store.get(TelebirrTokenCache.cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.token;
    }

    const token = await fetchAsync();
    if (!this.store.has(TelebirrTokenCache.cacheKey)) {
      this.setWithExpiry(token, 55 * 60 * 1000);
    }
    return token;
  }

  setWithExpiry(token: string, durationMs: number): void {
    const cacheDuration = Math.floor(durationMs * 0.9);
    this.store.set(TelebirrTokenCache.cacheKey, {
      token,
      expiresAt: Date.now() + cacheDuration,
    });
  }

  invalidate(): void {
    this.store.delete(TelebirrTokenCache.cacheKey);
  }
}
