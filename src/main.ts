import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // ─── CORS (must be BEFORE helmet) ────────────
  const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:3001',
    'https://rentflaw.vercel.app',
    process.env.FRONTEND_URL,
  ].filter(Boolean) as string[];

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      // Allow requests with no origin (curl, Swagger, mobile apps)
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        // Don't throw — just deny with false so server stays alive
        callback(null, false);
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    exposedHeaders: ['Set-Cookie'],
    preflightContinue: false,
    optionsSuccessStatus: 204,
  });

  // ─── Security (after CORS) ─────────────────────
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(cookieParser());

  // ─── Global Prefix ────────────────────────────
  app.setGlobalPrefix('api');

  // ─── Global Validation Pipe ───────────────────
  // Strips unknown properties, transforms types, and validates all DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Strip unknown fields
      forbidNonWhitelisted: true, // Throw on unknown fields
      transform: true, // Auto-transform payloads to DTO types
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // ─── Swagger API Docs (Development Only) ──────
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('RentFlaw API')
      .setDescription('Global Rental Management SaaS Platform — API Reference')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = process.env.PORT || 4000;
  await app.listen(port);
  console.log(`🚀 RentFlaw API running on: http://localhost:${port}/api`);
  if (process.env.NODE_ENV !== 'production') {
    console.log(`📚 Swagger docs: http://localhost:${port}/api/docs`);
  }
}
void bootstrap();
