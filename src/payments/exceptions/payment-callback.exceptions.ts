import { HttpException, HttpStatus } from '@nestjs/common';

/** Thrown when callback payload fails class-validator checks. */
export class InvalidCallbackPayloadException extends HttpException {
  constructor(message: string) {
    super(message, HttpStatus.BAD_REQUEST);
  }
}

/** Thrown when callback authenticity verification fails. */
export class CallbackVerificationFailedException extends HttpException {
  constructor(message = 'Callback verification failed.') {
    super(message, HttpStatus.UNAUTHORIZED);
  }
}
