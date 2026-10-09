import { type DynamicModule, Global, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { JwtVerifier } from './auth/jwt-verifier';
import { RevocationService } from './auth/revocation.service';
import { Clock } from './common/clock';
import { AllExceptionsFilter } from './common/exception.filter';
import { EnvelopeInterceptor } from './common/envelope.interceptor';
import { EndpointGuard } from './common/guards/endpoint.guard';
import { RateLimitService } from './common/rate-limit/rate-limit.service';
import { ConfigModule } from './config/config.module';
import type { Env } from './config/env';
import { DatabaseModule } from './db/database.module';
import { AuditService } from './domain/audit.service';
import { ClaimsService } from './domain/claims.service';
import { AccountService } from './domain/account.service';
import { AdminController } from './domain/admin.controller';
import { HighController } from './domain/high.controller';
import { OverviewService } from './domain/overview.service';
import { AccessQueryService } from './domain/access/access-query.service';
import { PermissionAdminService } from './domain/access/permission-admin.service';
import { RegistryService } from './domain/access/registry.service';
import { RbacController } from './domain/rbac.controller';
import { IdempotencyInterceptor } from './common/idempotency.interceptor';
import { RbacService } from './domain/rbac.service';
import { RolesService } from './domain/roles.service';
import { SettingsService } from './domain/settings.service';
import { ReportsService } from './domain/reports.service';
import { SessionsAdminService } from './domain/sessions-admin.service';
import { UsersAdminService } from './domain/users-admin.service';
import { UsersService } from './domain/users.service';
import { LowAdminClient, MidAdminClient } from './internal/admin-clients';
import { InfraController } from './infra/infra.controller';
import { EventsController } from './internal/events.controller';
import { EventsService } from './internal/events.service';
import { InternalGuard } from './internal/internal.guard';
import { MaintenanceService } from './outbox/maintenance.service';
import { AnnouncementsService } from './domain/announcements.service';
import { BadgesService } from './domain/badges/badges.service';
import { ExportController } from './domain/export.controller';
import { ExportService } from './domain/export.service';
import { OpsController } from './domain/ops.controller';
import { UserActivityService } from './domain/user-activity.service';
import { BadgeImageController } from './internal/badge-image.controller';
import { OutboxService } from './outbox/outbox.service';
import { TeacherBackfillService } from './outbox/teacher-backfill.service';
import { MediaUrlSigner } from './common/media-url';
import { CriteriaService } from './domain/criteria/criteria.service';
import { SessionContentService } from './domain/session-content.service';
import { ContentController } from './domain/content.controller';

const PROVIDERS = [RevocationService, JwtVerifier, RateLimitService, RbacService, AuditService, ClaimsService, UsersService, UsersAdminService, AccountService, SessionsAdminService, ReportsService, LowAdminClient, MidAdminClient, RolesService, RegistryService, PermissionAdminService, AccessQueryService, SettingsService, OverviewService, EventsService, InternalGuard, OutboxService, MaintenanceService, EndpointGuard, BadgesService, AnnouncementsService, ExportService, UserActivityService, MediaUrlSigner, CriteriaService, SessionContentService, TeacherBackfillService];

@Global()
@Module({ providers: PROVIDERS, exports: PROVIDERS })
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
            autoLogging: { ignore: (req) => (req.url ?? '').startsWith('/s/health') },
            redact: { paths: ['req.headers.authorization', 'req.headers.cookie', 'req.headers["x-step-up-token"]', 'req.headers["x-internal-token"]'], censor: '[redacted]' },
            serializers: {
              req: (r: { id: string; method: string; url: string; headers: Record<string, unknown> }) => ({ id: r.id, method: r.method, url: (r.url ?? '').split('?')[0], client: r.headers['x-isra-client'] }),
              res: (r: { statusCode: number }) => ({ statusCode: r.statusCode })
            }
          }
        }),
        DatabaseModule,
        CoreModule
      ],
      // ExportController اول: `/system/users/export` پیش از `/system/users/:id`
      controllers: [ExportController, HighController, AdminController, RbacController, OpsController, ContentController, InfraController, EventsController, BadgeImageController],
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
