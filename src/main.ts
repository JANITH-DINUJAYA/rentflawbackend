import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';


async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // ─── Security ──────────────────────────────────
  app.use(helmet());
  app.use(cookieParser());

  // ─── CORS ─────────────────────────────────────
  const allowedOrigins = [
    process.env.FRONTEND_URL || 'http://localhost:3000',
    'https://rentflaw.vercel.app',
  ];
  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, Swagger)
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: Origin ${origin} not allowed`));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // ─── Global Prefix ────────────────────────────
  app.setGlobalPrefix('api');

  // ─── Global Validation Pipe ───────────────────
  // Strips unknown properties, transforms types, and validates all DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,          // Strip unknown fields
      forbidNonWhitelisted: true, // Throw on unknown fields
      transform: true,          // Auto-transform payloads to DTO types
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
bootstrap();
