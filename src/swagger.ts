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
    .setTitle('EFDA-ETSwitch')
    .setDescription(
      [
        'EthSwitch (NGB) payment gateway microservice — hosted payment page flow for application fees.',
        '',
        '**Service API key** (`POST /initiate` only):',
        `- Header \`x-api-key: ${devKeyHint}\``,
        '- Or `Authorization: Bearer <SERVICE_API_KEY>`',
        '',
        'In Swagger UI click **Authorize**, enter the key under **service-api-key** (apiKey), then try initiate.',
      ].join('\n'),
    )
    .setVersion('1.0')
    .addApiKey(
      {
        type: 'apiKey',
        name: 'x-api-key',
        in: 'header',
        description: `SERVICE_API_KEY env value. Dev default: dev-efda-etswitch-local-key`,
      },
      'service-api-key',
    )
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'API Key',
        description: 'Same value as SERVICE_API_KEY (alternative to x-api-key)',
      },
      'bearer-service-key',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });
}
