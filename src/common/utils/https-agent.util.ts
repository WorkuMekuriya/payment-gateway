import * as https from 'https';

/** Shared HTTPS agent for outbound payment gateway calls. */
export function createHttpsAgent(rejectUnauthorized: boolean): https.Agent {
  return new https.Agent({ rejectUnauthorized });
}
