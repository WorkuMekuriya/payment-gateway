import { createPrivateKey, createPublicKey } from 'crypto';

/** Normalize PEM from .env (quoted multiline, literal \\n, or file content). */
export function loadPem(value: string | undefined): string {
  let pem = (value ?? '').trim();
  if (
    (pem.startsWith('"') && pem.endsWith('"')) ||
    (pem.startsWith("'") && pem.endsWith("'"))
  ) {
    pem = pem.slice(1, -1);
  }
  return pem.replace(/\\n/g, '\n').replace(/\r\n/g, '\n').trim();
}

export function assertPrivateKeyPem(pem: string, envVar = 'TELEBIRR_PRIVATE_KEY_PEM'): void {
  if (!pem) {
    throw new Error(
      `${envVar} is not set. Copy the full PKCS#8 key from the Telebirr developer portal ` +
        `(use a single line with \\n between lines, or TELEBIRR_PRIVATE_KEY_PATH to a .pem file).`,
    );
  }
  if (!pem.includes('BEGIN') || !pem.includes('END')) {
    throw new Error(
      `${envVar} must include -----BEGIN … KEY----- and -----END … KEY----- headers.`,
    );
  }
  try {
    createPrivateKey(pem);
  } catch {
    throw new Error(
      `${envVar} is invalid or truncated (${pem.length} chars). ` +
        'Paste the complete private key — a 2048-bit PKCS#8 key is typically ~1600+ characters.',
    );
  }
}

export function assertPublicKeyPem(pem: string, envVar = 'TELEBIRR_PUBLIC_KEY_PEM'): void {
  if (!pem) return;
  try {
    createPublicKey(pem);
  } catch {
    throw new Error(`${envVar} is invalid or truncated (${pem.length} chars).`);
  }
}
