import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Behind Railway's proxy; needed so rate limits see the real client IP.
  app.set('trust proxy', 1);

  // CORS must be configured BEFORE setGlobalPrefix
  const allowedOrigins = new Set<string>([
    'https://fieldops-web-production-8e0d.up.railway.app',
    'http://localhost:5173',
    'http://localhost:4173',
    'http://localhost:3000',
  ]);
  const envOrigins = [
    process.env.FRONTEND_URL,
    ...(process.env.CORS_ORIGINS ?? '').split(','),
  ];
  for (const raw of envOrigins) {
    const origin = raw?.trim().replace(/\/+$/, '');
    if (origin) allowedOrigins.add(origin);
  }

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

  if (!process.env.INTERNAL_API_KEY) {
    console.warn(
      'INTERNAL_API_KEY is not set; internal (n8n) endpoints will reject all calls',
    );
  }

  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (curl, Postman, mobile apps)
      if (!origin) return callback(null, true);
      const normalized = origin.replace(/\/+$/, '');
      if (allowedOrigins.has(normalized)) {
        return callback(null, true);
      }
      return callback(new Error(`CORS origin not allowed: ${origin}`), false);
    },
    methods: ['GET', 'HEAD', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'X-Requested-With',
      'Origin',
      'Cache-Control',
      'Pragma',
    ],
    exposedHeaders: ['Content-Range', 'X-Content-Range'],
    credentials: true,
    preflightContinue: false,
    optionsSuccessStatus: 204,
    maxAge: 86400,
  });

  app.setGlobalPrefix('api');

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

  app.useGlobalFilters(new HttpExceptionFilter());

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`Application is running on port ${port}`);
}
void bootstrap();
