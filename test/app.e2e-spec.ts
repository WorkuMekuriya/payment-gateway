import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';

describe('Payment Gateway (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects unauthenticated initiate without API key when configured', async () => {
    if (!process.env.SERVICE_API_KEY?.trim()) {
      return;
    }

    await request(app.getHttpServer())
      .post('/api/ethswitch/initiate/1')
      .send({ paymentInfoId: 1, amount: 1 })
      .expect(401);
  });
});
