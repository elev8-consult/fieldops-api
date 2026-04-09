import { NestFactory }    from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule }      from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // CORS must be configured BEFORE setGlobalPrefix
  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (curl, Postman, mobile apps)
      if (!origin) return callback(null, true);

      const allowedOrigins = [
        'https://fieldops-web-production-8e0d.up.railway.app',
        'http://localhost:5173',
        'http://localhost:4173',
        'http://localhost:3000',
      ];

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        // In development allow all — remove this in strict production
        callback(null, true);
      }
    },
    methods:      ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS', 'HEAD'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'X-Requested-With',
      'Origin',
    ],
    exposedHeaders:   ['Content-Range', 'X-Content-Range'],
    credentials:      true,
    preflightContinue: false,
    optionsSuccessStatus: 204,
  });

  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist:            true,
      forbidNonWhitelisted: true,
      transform:            true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`Application is running on port ${port}`);
}
bootstrap();
