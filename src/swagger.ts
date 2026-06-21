import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

/** Enabled when NODE_ENV is not production (development, local, test, etc.). */
export function isSwaggerEnabled(): boolean {
  return process.env.NODE_ENV !== 'production';
}

export function setupSwagger(app: INestApplication): void {
  if (!isSwaggerEnabled()) return;

  const devKeyHint =
    process.env.SERVICE_API_KEY?.trim() ||
    '(set SERVICE_API_KEY in .env — guard is open when empty)';

  const config = new DocumentBuilder()
    .setTitle('EFDA Payment Gateway')
    .setDescription(
      [
        'EthSwitch (NGB) and Telebirr payment gateway microservice.',
        '',
        '**Service API key** (initiate, reconcile, status):',
        `- \`Authorization: Bearer ${devKeyHint}\``,
        '- Or header `x-api-key` (same value)',
        '',
        'Click **Authorize** once and enter `SERVICE_API_KEY` as the Bearer token — all protected endpoints inherit it.',
      ].join('\n'),
    )
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'API Key',
        description: `SERVICE_API_KEY from .env (e.g. ${devKeyHint})`,
      },
      'bearer-service-key',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });
}
