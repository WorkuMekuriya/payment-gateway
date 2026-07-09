/** Result of processing an inbound provider callback (mapped to HTTP in controller). */
export enum CallbackProcessingOutcome {
  PROCESSED = 'PROCESSED',
  DUPLICATE = 'DUPLICATE',
  INVALID_PAYLOAD = 'INVALID_PAYLOAD',
  VERIFICATION_FAILED = 'VERIFICATION_FAILED',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

export interface CallbackHandleResult {
  outcome: CallbackProcessingOutcome;
  message: string;
  transactionReference?: string;
}
