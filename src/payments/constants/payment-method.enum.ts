/**
 * How the payer completes a transaction (distinct from {@link PaymentProvider}).
 *
 * `provider` identifies the gateway; `paymentMethod` describes the checkout mechanism.
 */
export enum PaymentMethod {
  /** EthSwitch NGB Hosted Payment Page */
  HPP = 'HPP',
  /** Telebirr H5 hosted checkout */
  HOSTED_CHECKOUT = 'HOSTED_CHECKOUT',
}
