/** Mirrors FL.Services.Payment.EthSwitch.EthSwitchTransactionStatus */
export const EthSwitchTransactionStatus = {
  Pending: 'PENDING',
  Success: 'SUCCESS',
  Failed: 'FAIL',
  TimedOut: 'TIMEOUT',
  Cancelled: 'CANCELLED',
} as const;

/** Mirrors FL.Services.Payment.EthSwitch.EthSwitchCallbackStatus */
export const EthSwitchCallbackStatus = {
  Paid: 'PAID',
  Failed: 'FAILED',
} as const;

export type EthSwitchTransactionStatusValue =
  (typeof EthSwitchTransactionStatus)[keyof typeof EthSwitchTransactionStatus];
