/**
 * Application Entry Point
 * 
 * Bootstraps the NestJS application with:
 *   - Global validation pipe (class-validator) per TRD Section 5.3
 *   - Global API prefix /api/v1 per TRD Section 5.1
 *   - Structured JSON logging per TRD Section 11.1
 */
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // Structured JSON logging for observability (TRD Section 11.1)
    logger: ['log', 'error', 'warn', 'debug', 'verbose'],
  });

  // Global prefix: all endpoints under /api/v1 (TRD Section 5.1)
  app.setGlobalPrefix('api/v1');

  // Global validation pipe for DTO validation (TRD Section 5.3)
  // whitelist: strips unknown properties (defense against injection)
  // forbidNonWhitelisted: rejects requests with unknown fields
  // transform: auto-transforms payloads to DTO instances
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  const port = process.env.PORT || 3000;
  await app.listen(port);

  const logger = new Logger('Bootstrap');
  logger.log(`Time-Off Microservice running on port ${port}`);
  logger.log(`API base: http://localhost:${port}/api/v1/time-off`);
}

bootstrap();
