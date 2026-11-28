import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ErrorCode } from '@apt/shared-types';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './shared/filters/http-exception.filter';
import { SwaggerModule } from '@nestjs/swagger';
import { createOpenApiDocument } from './openapi/contract';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const configService = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  // Lấy đúng IP client sau reverse proxy (Nginx = 1 tầng). Đặt sai số tầng sẽ
  // cho phép giả mạo X-Forwarded-For để né rate-limit, nên cấu hình qua env.
  const trustProxyHops = configService.get<number>('trustProxyHops') ?? 0;
  if (trustProxyHops > 0) {
    app.set('trust proxy', trustProxyHops);
  }

  // Prefix URL
  const apiPrefix = configService.get<string>('apiPrefix') || 'api/v1';
  app.setGlobalPrefix(apiPrefix);

  if (process.env.NODE_ENV !== 'production') {
    SwaggerModule.setup('docs', app, createOpenApiDocument(app, apiPrefix));
  }

  // Global Exception Filter
  app.useGlobalFilters(new HttpExceptionFilter());

  // Global Validation Pipe (WP-7.1: luôn kèm ErrorCode.VALIDATION_FAILED)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      exceptionFactory: (errors) => {
        const messages = errors.flatMap((err) => {
          const own = err.constraints ? Object.values(err.constraints) : [];
          const children =
            err.children?.flatMap((child) =>
              child.constraints ? Object.values(child.constraints) : [],
            ) ?? [];
          return [...own, ...children];
        });
        return new BadRequestException({
          code: ErrorCode.VALIDATION_FAILED,
          message:
            messages.length > 0 ? messages : 'Dữ liệu đầu vào không hợp lệ',
        });
      },
    }),
  );

  // Enable CORS
  const corsOrigins = configService.get<string[]>('corsOrigins') || [
    'http://localhost:3000',
  ];
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });

  const port = configService.get<number>('port') || 3001;
  await app.listen(port);
  logger.log(
    `Backend server đang chạy tại: http://localhost:${port}/${apiPrefix}`,
  );
}
void bootstrap();
