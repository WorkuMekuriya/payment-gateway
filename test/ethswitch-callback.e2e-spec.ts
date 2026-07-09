import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { json } from 'express';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { EthSwitchTransactionStatus } from '../src/ethswitch/constants/statuses';
import { EthSwitchTransaction } from '../src/ethswitch/entities/ethswitch-transaction.entity';
import { PaymentProvider } from '../src/payments/constants/payment-provider.enum';
import { PaymentMethod } from '../src/payments/constants/payment-method.enum';
import { PaymentStatus } from '../src/payments/constants/payment-status.enum';
import { Payment } from '../src/payments/entities/payment.entity';
import { PAYMENT_EVENT_PUBLISHER } from '../src/payments/constants/injection-tokens';

describe('EthSwitch callback (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  const merchOrderId = `FL-e2e-${Date.now()}`;

  const mockEventPublisher = {
    publishPaymentCompleted: jest.fn().mockResolvedValue(undefined),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PAYMENT_EVENT_PUBLISHER)
      .useValue(mockEventPublisher)
      .compile();

    app = moduleFixture.createNestApplication({ bodyParser: false });
    app.use(
      json({
        verify: (req, _res, buf) => {
          (req as { rawBody?: Buffer }).rawBody = buf;
        },
      }),
    );
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();

    dataSource = moduleFixture.get(DataSource);

    const migrationSql = readFileSync(
      join(__dirname, '../src/database/003_payments.sql'),
      'utf8',
    );
    await dataSource.query(migrationSql);

    const txRepo = dataSource.getRepository(EthSwitchTransaction);
    await txRepo.save(
      txRepo.create({
        paymentInfoId: 1001,
        applicationId: 2002,
        merchOrderId,
        tradeStatus: EthSwitchTransactionStatus.Pending,
        totalAmount: '250.00',
        transCurrency: 'ETB',
        title: 'E2E test fee',
        checkoutUrl: 'https://example.com/checkout',
        initiatedAt: new Date(),
      }),
    );

    const paymentRepo = dataSource.getRepository(Payment);
    await paymentRepo.save(
      paymentRepo.create({
        paymentInfoId: 1001,
        applicationId: 2002,
        transactionReference: merchOrderId,
        amount: '250.00',
        currency: 'ETB',
        paymentStatus: PaymentStatus.PENDING,
        paymentMethod: PaymentMethod.HPP,
        provider: PaymentProvider.ETHSWITCH,
      }),
    );
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      const txRepo = dataSource.getRepository(EthSwitchTransaction);
      const paymentRepo = dataSource.getRepository(Payment);
      await txRepo.delete({ merchOrderId });
      await paymentRepo.delete({
        provider: PaymentProvider.ETHSWITCH,
        transactionReference: merchOrderId,
      });
    }
    await app.close();
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  it('POST /api/v1/payments/ethswitch/callback returns 400 for invalid payload', () => {
    return request(app.getHttpServer())
      .post('/api/v1/payments/ethswitch/callback')
      .send({ status: 'PAID' })
      .expect(400);
  });

  it('POST /api/v1/payments/ethswitch/callback processes PAID callback', async () => {
    const payload = {
      status: 'PAID',
      transaction_id: 'e2e-txn-001',
      data: {
        request_id: merchOrderId,
        bill_info: { totalAmount: 250, currency: 'ETB' },
      },
    };

    const response = await request(app.getHttpServer())
      .post('/api/v1/payments/ethswitch/callback')
      .send(payload)
      .expect(200);

    expect(response.body.code).toBe('SUCCESS');

    const paymentRepo = dataSource.getRepository(Payment);
    const payment = await paymentRepo.findOne({
      where: {
        provider: PaymentProvider.ETHSWITCH,
        transactionReference: merchOrderId,
      },
    });

    expect(payment?.paymentStatus).toBe(PaymentStatus.SUCCESS);
    expect(payment?.providerTransactionId).toBe('e2e-txn-001');
    expect(mockEventPublisher.publishPaymentCompleted).toHaveBeenCalled();
  });

  it('POST /api/v1/payments/ethswitch/callback is idempotent for duplicate callbacks', async () => {
    mockEventPublisher.publishPaymentCompleted.mockClear();

    const payload = {
      status: 'PAID',
      transaction_id: 'e2e-txn-001',
      data: {
        request_id: merchOrderId,
        bill_info: { totalAmount: 250, currency: 'ETB' },
      },
    };

    const response = await request(app.getHttpServer())
      .post('/api/v1/payments/ethswitch/callback')
      .send(payload)
      .expect(200);

    expect(response.body.code).toBe('SUCCESS');
    expect(mockEventPublisher.publishPaymentCompleted).not.toHaveBeenCalled();
  });
});
