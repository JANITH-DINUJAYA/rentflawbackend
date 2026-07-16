import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';

import { PrismaModule } from './database/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { LandlordsModule } from './modules/landlords/landlords.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { PropertiesModule } from './modules/properties/properties.module';
import { FloorsModule } from './modules/floors/floors.module';
import { RoomsModule } from './modules/rooms/rooms.module';
import { AgreementsModule } from './modules/agreements/agreements.module';
import { InvoicesModule } from './modules/invoices/invoices.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { UtilitiesModule } from './modules/utilities/utilities.module';
import { StaffModule } from './modules/staff/staff.module';
import { RolesModule } from './modules/roles/roles.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { ReportsModule } from './modules/reports/reports.module';
import { SupportModule } from './modules/support/support.module';
import { FilesModule } from './modules/files/files.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { MessagesModule } from './modules/messages/messages.module';
import { JobsModule } from './jobs/jobs.module';

@Module({
  imports: [
    // ─── Config ─────────────────────────────────
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // ─── Scheduler ──────────────────────────────
    ScheduleModule.forRoot(),

    // ─── Rate Limiting ───────────────────────────
    ThrottlerModule.forRoot([
      {
        ttl: parseInt(process.env.THROTTLE_TTL || '60') * 1000,
        limit: parseInt(process.env.THROTTLE_LIMIT || '100'),
      },
    ]),

    // ─── Database ────────────────────────────────
    PrismaModule,

    // ─── Feature Modules ─────────────────────────
    AuthModule,
    UsersModule,
    LandlordsModule,
    TenantsModule,
    PropertiesModule,
    FloorsModule,
    RoomsModule,
    AgreementsModule,
    InvoicesModule,
    PaymentsModule,
    UtilitiesModule,
    StaffModule,
    RolesModule,
    SubscriptionsModule,
    ReportsModule,
    SupportModule,
    FilesModule,
    NotificationsModule,
    MessagesModule,
    JobsModule,
  ],
  providers: [
    // Global rate limiting guard
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}

