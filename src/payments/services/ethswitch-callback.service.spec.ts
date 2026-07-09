import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { EthSwitchTransactionStatus } from '../../ethswitch/constants/statuses';
import { EthSwitchTransaction } from '../../ethswitch/entities/ethswitch-transaction.entity';
import { PAYMENT_EVENT_PUBLISHER } from '../constants/injection-tokens';
import { PaymentProvider } from '../constants/payment-provider.enum';
import { PaymentMethod } from '../constants/payment-method.enum';
import { PaymentStatus } from '../constants/payment-status.enum';
import { PaymentCallbackLog } from '../entities/payment-callback-log.entity';
import { Payment } from '../entities/payment.entity';
import { CallbackProcessingOutcome } from '../interfaces/callback-handle-result.interface';
import { EthSwitchCallbackService } from './ethswitch-callback.service';
import { PaymentCallbackLogService } from './payment-callback-log.service';
import { EthSwitchCallbackVerifier } from '../verifiers/ethswitch-callback.verifier';

describe('EthSwitchCallbackService', () => {
  let service: EthSwitchCallbackService;
  let paymentRepo: jest.Mocked<Repository<Payment>>;
  let ethSwitchTxRepo: jest.Mocked<Repository<EthSwitchTransaction>>;
  let verifier: jest.Mocked<Pick<EthSwitchCallbackVerifier, 'verify'>>;
  let eventPublisher: { publishPaymentCompleted: jest.Mock };
  let callbackLogService: jest.Mocked<
    Pick<PaymentCallbackLogService, 'logCallback'>
  >;

  const merchOrderId = 'FL12345abc';
  const validPayload = {
    status: 'PAID',
    transaction_id: 'txn-001',
    data: {
      request_id: merchOrderId,
      bill_info: { totalAmount: 100, currency: 'ETB' },
    },
  };

  const mockEthSwitchTx: EthSwitchTransaction = {
    id: 1,
    paymentInfoId: 10,
    applicationId: 20,
    merchOrderId,
    orderReference: null,
    hppToken: null,
    billPaymentRequestId: null,
    transId: null,
    tradeStatus: EthSwitchTransactionStatus.Pending,
    totalAmount: '100.00',
    transCurrency: 'ETB',
    title: 'Fee',
    checkoutUrl: 'https://example.com/pay',
    initiatedAt: new Date(),
    expiresAt: null,
    callbackReceivedAt: null,
    rawCallback: null,
    createdDate: new Date(),
    modifiedDate: new Date(),
  };

  beforeEach(async () => {
    paymentRepo = {
      findOne: jest.fn(),
      create: jest.fn((entity) => entity as Payment),
      save: jest.fn(async (entity) => ({ id: 99, ...entity }) as Payment),
    } as unknown as jest.Mocked<Repository<Payment>>;

    ethSwitchTxRepo = {
      findOne: jest.fn(),
      save: jest.fn(async (entity) => entity),
    } as unknown as jest.Mocked<Repository<EthSwitchTransaction>>;

    verifier = { verify: jest.fn().mockResolvedValue(true) };
    eventPublisher = { publishPaymentCompleted: jest.fn().mockResolvedValue(undefined) };
    callbackLogService = { logCallback: jest.fn().mockResolvedValue({ id: 1 }) };

    const dataSource = {
      transaction: jest.fn(async (work) => {
        const manager = {
          getRepository: (entity: unknown) => {
            if (entity === EthSwitchTransaction) return ethSwitchTxRepo;
            if (entity === Payment) return paymentRepo;
            if (entity === PaymentCallbackLog) {
              return { create: jest.fn((e) => e), save: jest.fn(async (e) => e) };
            }
            return { create: jest.fn(), save: jest.fn() };
          },
        };
        return work(manager);
      }),
    } as unknown as DataSource;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EthSwitchCallbackService,
        { provide: DataSource, useValue: dataSource },
        { provide: getRepositoryToken(Payment), useValue: paymentRepo },
        {
          provide: getRepositoryToken(EthSwitchTransaction),
          useValue: ethSwitchTxRepo,
        },
        { provide: PaymentCallbackLogService, useValue: callbackLogService },
        { provide: EthSwitchCallbackVerifier, useValue: verifier },
        { provide: PAYMENT_EVENT_PUBLISHER, useValue: eventPublisher },
      ],
    }).compile();

    service = module.get(EthSwitchCallbackService);
  });

  it('returns INVALID_PAYLOAD for malformed JSON', async () => {
    const result = await service.handleCallback({
      rawBody: Buffer.from('not-json'),
      headers: {},
      ip: '127.0.0.1',
      body: {},
    } as never);

    expect(result.outcome).toBe(CallbackProcessingOutcome.INVALID_PAYLOAD);
    expect(callbackLogService.logCallback).toHaveBeenCalled();
  });

  it('returns VERIFICATION_FAILED when verifier rejects the callback', async () => {
    verifier.verify.mockResolvedValue(false);

    const result = await service.handleCallback({
      rawBody: Buffer.from(JSON.stringify(validPayload)),
      headers: {},
      ip: '127.0.0.1',
      body: validPayload,
    } as never);

    expect(result.outcome).toBe(CallbackProcessingOutcome.VERIFICATION_FAILED);
  });

  it('returns DUPLICATE when payment is already terminal', async () => {
    ethSwitchTxRepo.findOne.mockResolvedValue(mockEthSwitchTx);
    paymentRepo.findOne.mockResolvedValue({
      id: 5,
      paymentInfoId: 10,
      applicationId: 20,
      transactionReference: merchOrderId,
      providerTransactionId: 'txn-old',
      amount: '100.00',
      currency: 'ETB',
      paymentStatus: PaymentStatus.SUCCESS,
      paymentMethod: PaymentMethod.HPP,
      provider: PaymentProvider.ETHSWITCH,
      callbackPayload: '{}',
      callbackReceivedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await service.handleCallback({
      rawBody: Buffer.from(JSON.stringify(validPayload)),
      headers: {},
      ip: '127.0.0.1',
      body: validPayload,
    } as never);

    expect(result.outcome).toBe(CallbackProcessingOutcome.DUPLICATE);
    expect(eventPublisher.publishPaymentCompleted).not.toHaveBeenCalled();
  });

  it('processes PAID callback and publishes PaymentCompleted event', async () => {
    ethSwitchTxRepo.findOne.mockResolvedValue({ ...mockEthSwitchTx });
    paymentRepo.findOne.mockResolvedValue(null);

    const result = await service.handleCallback({
      rawBody: Buffer.from(JSON.stringify(validPayload)),
      headers: {},
      ip: '127.0.0.1',
      body: validPayload,
    } as never);

    expect(result.outcome).toBe(CallbackProcessingOutcome.PROCESSED);
    expect(ethSwitchTxRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        tradeStatus: EthSwitchTransactionStatus.Success,
        transId: 'txn-001',
      }),
    );
    expect(eventPublisher.publishPaymentCompleted).toHaveBeenCalledWith(
      expect.objectContaining({
        transactionReference: merchOrderId,
        provider: PaymentProvider.ETHSWITCH,
        paymentMethod: PaymentMethod.HPP,
      }),
    );
  });
});
