import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { json } from 'express';
import { AppModule } from './app.module';
import { isSwaggerEnabled, setupSwagger } from './swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });

  // Raw body for callback — mirrors EthSwitchController manual StreamReader deserialize.
  app.use(
    json({
      verify: (req, _res, buf) => {
        (req as { rawBody?: Buffer }).rawBody = buf;
      },
    }),
  );

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  setupSwagger(app);

  const port = process.env.PORT ?? 3100;
  await app.listen(port);

  if (isSwaggerEnabled()) {
    console.log(`Environment: ${process.env.NODE_ENV}`);
    console.log(`Swagger UI: http://localhost:${port}/api/docs`);
    const apiKey = process.env.SERVICE_API_KEY?.trim();
    if (apiKey) {
      console.log('Initiate auth: Authorization Bearer (see SERVICE_API_KEY in .env)');
    } else {
      console.warn(
        'SERVICE_API_KEY is empty — initiate endpoint accepts unauthenticated calls',
      );
    }
    if (
      process.env.NODE_ENV !== 'production' &&
      process.env.TELEBIRR_ALLOW_INSECURE_TLS === 'true'
    ) {
      console.warn(
        'TELEBIRR_ALLOW_INSECURE_TLS=true — TLS verification disabled for Telebirr API (dev sandbox only)',
      );
    }
  }
}

void bootstrap();
