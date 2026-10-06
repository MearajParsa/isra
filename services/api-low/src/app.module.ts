import { type DynamicModule, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { AuthModule } from './auth/auth.module';
import { AllExceptionsFilter } from './common/exception.filter';
import { EnvelopeInterceptor } from './common/envelope.interceptor';
import { Clock } from './common/clock';
import { EndpointGuard } from './common/guards/endpoint.guard';
import { ConfigModule } from './config/config.module';
import type { Env } from './config/env';
import { DatabaseModule } from './db/database.module';
import { InfraController } from './infra/infra.controller';
import { AdminController } from './internal/admin.controller';
import { AdminService } from './internal/admin.service';
import { EventsController } from './internal/events.controller';
import { EventsService } from './internal/events.service';
import { InternalGuard } from './internal/internal.guard';
import { MeController } from './me/me.controller';
import { MeService } from './me/me.service';
import { MidModule } from './mid/mid.module';
import { MaintenanceService } from './outbox/maintenance.service';
import { BroadcastService } from './messaging/broadcast.service';
import { AccountDeletionService } from './users/account-deletion.service';
import { OutboxService } from './outbox/outbox.service';
import { PublicController } from './public/public.controller';
import { SmsModule } from './sms/sms.module';

@Module({})
export class AppModule {
  static forRoot(env: Env, clock?: Clock): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot(env, clock),
        LoggerModule.forRoot({
          pinoHttp: {
            level: env.LOG_LEVEL,
            genReqId: (req) => (req as { ctx?: { requestId: string } }).ctx?.requestId ?? 'n/a',
            autoLogging: { ignore: (req) => (req.url ?? '').startsWith('/c/health') },
            // بدون PII/secret: هدرهای حساس و بدنه هرگز لاگ نمی‌شوند
            redact: { paths: ['req.headers.authorization', 'req.headers.cookie', 'req.headers["x-step-up-token"]', 'req.headers["x-internal-token"]', 'res.headers["set-cookie"]'], censor: '[redacted]' },
            serializers: {
              req: (r: { id: string; method: string; url: string; headers: Record<string, unknown> }) => ({ id: r.id, method: r.method, url: (r.url ?? '').split('?')[0], client: r.headers['x-isra-client'] }),
              res: (r: { statusCode: number }) => ({ statusCode: r.statusCode })
            }
          }
        }),
        DatabaseModule,
        SmsModule,
        MidModule,
        AuthModule
      ],
      controllers: [MeController, PublicController, InfraController, EventsController, AdminController],
      providers: [
        MeService,
        EventsService,
        AdminService,
        InternalGuard,
        OutboxService,
        MaintenanceService,
        BroadcastService,
        AccountDeletionService,
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
        { provide: APP_INTERCEPTOR, useClass: EnvelopeInterceptor },
        { provide: APP_GUARD, useExisting: EndpointGuard }
      ]
    };
  }
}
