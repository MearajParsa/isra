import { type DynamicModule, Global, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { JwtVerifier } from './auth/jwt-verifier';
import { RevocationService } from './auth/revocation.service';
import { Clock } from './common/clock';
import { AllExceptionsFilter } from './common/exception.filter';
import { EnvelopeInterceptor } from './common/envelope.interceptor';
import { EndpointGuard } from './common/guards/endpoint.guard';
import { IdempotencyInterceptor } from './common/idempotency.interceptor';
import { RateLimitService } from './common/rate-limit/rate-limit.service';
import { ConfigModule } from './config/config.module';
import type { Env } from './config/env';
import { DatabaseModule } from './db/database.module';
import { MembersAccess } from './domain/access.service';
import { AttendanceService } from './domain/attendance.service';
import { EvaluationsService } from './domain/evaluations.service';
import { InvitesService } from './domain/invites.service';
import { MembersService } from './domain/members.service';
import { MidController } from './domain/mid.controller';
import { PointsService } from './domain/points.service';
import { QueueService } from './domain/queue.service';
import { SessionsService } from './domain/sessions.service';
import { SettingsService } from './domain/settings.service';
import { InfraController } from './infra/infra.controller';
import { AdminMembersController } from './internal/admin-members.controller';
import { AdminMembersService } from './internal/admin-members.service';
import { AdminController } from './internal/admin.controller';
import { AdminService } from './internal/admin.service';
import { EventsService } from './internal/events.service';
import { InternalController } from './internal/internal.controller';
import { InternalGuard } from './internal/internal.guard';
import { LiveService } from './live/live.service';
import { BadgesService } from './domain/badges.service';
import { OccurrencesService } from './domain/occurrences.service';
import { OpsController } from './domain/ops.controller';
import { PostCommit } from './domain/post-commit';
import { AdminOpsController, PointsInternalController } from './internal/admin-ops.controller';
import { AdminOpsService } from './internal/admin-ops.service';
import { MaintenanceService } from './outbox/maintenance.service';
import { CatalogService } from './domain/catalog.service';
import { CommentsService } from './domain/comments.service';
import { ContentController } from './domain/content.controller';
import { GalleriesService } from './domain/galleries.service';
import { SupportersService } from './domain/supporters.service';
import { AdminContentController } from './internal/admin-content.controller';
import { MediaService } from './media/media.service';
import { OutboxService } from './outbox/outbox.service';

const PROVIDERS = [RevocationService, JwtVerifier, RateLimitService, MembersAccess, SettingsService, PointsService, LiveService, SessionsService, MembersService, AttendanceService, QueueService, EvaluationsService, EventsService, AdminService, InvitesService, AdminMembersService, InternalGuard, OutboxService, MaintenanceService, EndpointGuard];

/** ۱.۶.۰ نوبت/حضور/صف/ارزیابی/امتیاز/نشان (docs-v2/30) */
const OPS_PROVIDERS = [PostCommit, BadgesService, OccurrencesService, AdminOpsService];
const OPS_CONTROLLERS = [OpsController, AdminOpsController, PointsInternalController];

/** ۱.۷.۰ صاحب/پشتیبان، معیار پویا، baseline سطوح، گالری، کامنت (docs-v2/31) */
const CONTENT_PROVIDERS = [CatalogService, MediaService, SupportersService, GalleriesService, CommentsService];
const CONTENT_CONTROLLERS = [ContentController, AdminContentController];

@Global()
@Module({ providers: [...PROVIDERS, ...OPS_PROVIDERS, ...CONTENT_PROVIDERS], exports: [...PROVIDERS, ...OPS_PROVIDERS, ...CONTENT_PROVIDERS] })
class CoreModule {}

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
            autoLogging: { ignore: (req) => (req.url ?? '').startsWith('/o/health') },
            redact: { paths: ['req.headers.authorization', 'req.headers.cookie', 'req.headers["x-internal-token"]'], censor: '[redacted]' },
            serializers: {
              req: (r: { id: string; method: string; url: string; headers: Record<string, unknown> }) => ({ id: r.id, method: r.method, url: (r.url ?? '').split('?')[0], client: r.headers['x-isra-client'] }),
              res: (r: { statusCode: number }) => ({ statusCode: r.statusCode })
            }
          }
        }),
        DatabaseModule,
        CoreModule
      ],
      controllers: [MidController, InfraController, InternalController, AdminController, AdminMembersController, ...OPS_CONTROLLERS, ...CONTENT_CONTROLLERS],
      providers: [
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
        // ترتیب مهم: Envelope بیرونی، Idempotency داخلی (پاسخ ذخیره‌شده هم envelope می‌شود)
        { provide: APP_INTERCEPTOR, useClass: EnvelopeInterceptor },
        { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
        { provide: APP_GUARD, useExisting: EndpointGuard }
      ]
    };
  }
}
