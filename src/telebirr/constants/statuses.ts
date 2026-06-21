export const TelebirrTransactionStatus = {
  Pending: 'PENDING',
  Success: 'SUCCESS',
  Failed: 'FAIL',
  TimedOut: 'TIMEOUT',
} as const;

export const TelebirrOrderStatus = {
  PaySuccess: 'PAY_SUCCESS',
  PayFailed: 'PAY_FAILED',
  WaitPay: 'WAIT_PAY',
  OrderClosed: 'ORDER_CLOSED',
  Paying: 'PAYING',
  Accepted: 'ACCEPTED',
} as const;

export const TelebirrCallbackStatus = {
  Completed: 'Completed',
  Pending: 'Pending',
  Failure: 'Failure',
  Expired: 'Expired',
  Paying: 'Paying',
} as const;
