import { createHmac } from 'node:crypto';
import { ConfigType } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import ethswitchConfig from '../../config/ethswitch.config';
import { EthSwitchCallbackVerifier } from './ethswitch-callback.verifier';

describe('EthSwitchCallbackVerifier', () => {
  const rawBody = JSON.stringify({
    status: 'PAID',
    data: { request_id: 'FL123' },
  });

  const buildModule = async (config: Partial<ConfigType<typeof ethswitchConfig>>) => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EthSwitchCallbackVerifier,
        {
          provide: ethswitchConfig.KEY,
          useValue: {
            callbackSecret: '',
            allowedIps: [],
            callbackUsername: '',
            callbackPassword: '',
            ...config,
          },
        },
      ],
    }).compile();

    return module.get(EthSwitchCallbackVerifier);
  };

  it('passes when no security mechanisms are configured', async () => {
    const verifier = await buildModule({});
    await expect(
      verifier.verify({
        rawBody,
        headers: {},
        sourceIp: '10.0.0.1',
      }),
    ).resolves.toBe(true);
  });

  it('rejects callbacks from IPs outside the allowlist', async () => {
    const verifier = await buildModule({ allowedIps: ['203.0.113.10'] });
    await expect(
      verifier.verify({
        rawBody,
        headers: {},
        sourceIp: '198.51.100.1',
      }),
    ).resolves.toBe(false);
  });

  it('accepts callbacks from allowed IPs', async () => {
    const verifier = await buildModule({ allowedIps: ['203.0.113.10'] });
    await expect(
      verifier.verify({
        rawBody,
        headers: {},
        sourceIp: '203.0.113.10',
      }),
    ).resolves.toBe(true);
  });

  it('verifies HMAC-SHA256 signatures', async () => {
    const secret = 'test-secret';
    const signature = createHmac('sha256', secret)
      .update(rawBody, 'utf8')
      .digest('hex');

    const verifier = await buildModule({ callbackSecret: secret });
    await expect(
      verifier.verify({
        rawBody,
        headers: { 'x-ethswitch-signature': signature },
        sourceIp: '127.0.0.1',
      }),
    ).resolves.toBe(true);
  });

  it('rejects invalid HMAC signatures', async () => {
    const verifier = await buildModule({ callbackSecret: 'test-secret' });
    await expect(
      verifier.verify({
        rawBody,
        headers: { 'x-ethswitch-signature': 'deadbeef' },
        sourceIp: '127.0.0.1',
      }),
    ).resolves.toBe(false);
  });

  it('verifies HTTP Basic Auth credentials', async () => {
    const verifier = await buildModule({
      callbackUsername: 'ethswitch',
      callbackPassword: 's3cret',
    });

    const token = Buffer.from('ethswitch:s3cret').toString('base64');
    await expect(
      verifier.verify({
        rawBody,
        headers: { authorization: `Basic ${token}` },
        sourceIp: '127.0.0.1',
      }),
    ).resolves.toBe(true);
  });

  it('rejects invalid Basic Auth credentials', async () => {
    const verifier = await buildModule({
      callbackUsername: 'ethswitch',
      callbackPassword: 's3cret',
    });

    const token = Buffer.from('ethswitch:wrong').toString('base64');
    await expect(
      verifier.verify({
        rawBody,
        headers: { authorization: `Basic ${token}` },
        sourceIp: '127.0.0.1',
      }),
    ).resolves.toBe(false);
  });
});
