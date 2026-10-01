import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { CoreHubJwtGuard } from './auth/guards/core-hub-jwt.guard';
import { PermissionsGuard } from './auth/guards/permissions.guard';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import {
  IpThrottlerGuard,
  ThrottleStore,
  UserThrottlerGuard,
} from './common/guards/subsystem-throttler.guard';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import configuration from './config/configuration';
import { validateEnv } from './config/env.validation';
import { LocalIdentityGuard } from './dev/local-identity.guard';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { ReservationsModule } from './reservations/reservations.module';
import { RoomsModule } from './rooms/rooms.module';
import { SchedulesModule } from './schedules/schedules.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnv,
    }),
    PrismaModule,
    AuthModule,
    HealthModule,
    SchedulesModule,
    RoomsModule,
    ReservationsModule,
  ],
  providers: [
    ThrottleStore,
    // Global guards run in the order listed here.
    // 1. Per-address rate limit, before any signature is checked.
    { provide: APP_GUARD, useClass: IpThrottlerGuard },
    // 2. Every route is authenticated unless explicitly marked @Public().
    // (LOCAL_TEST_ROLE swaps in a fixed test user - see src/dev/local-identity.guard.ts)
    {
      provide: APP_GUARD,
      useClass: process.env.LOCAL_TEST_ROLE?.trim() ? LocalIdentityGuard : CoreHubJwtGuard,
    },
    // 3. Per-user rate limit, now that the caller is known.
    { provide: APP_GUARD, useClass: UserThrottlerGuard },
    // 4. Authorization runs after authentication.
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
