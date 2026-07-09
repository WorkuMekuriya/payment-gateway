/** DI token for injectable payment event publishers (HTTP, RabbitMQ, Kafka, …). */
export const PAYMENT_EVENT_PUBLISHER = Symbol('PAYMENT_EVENT_PUBLISHER');

/** DI token for EthSwitch-specific callback verification strategy. */
export const ETHSWITCH_CALLBACK_VERIFIER = Symbol('ETHSWITCH_CALLBACK_VERIFIER');
