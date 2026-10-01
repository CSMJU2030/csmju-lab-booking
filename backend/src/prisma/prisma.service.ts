import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';

/**
 * Connection to the subsystem's OWN database (never the Core Hub database).
 *
 * Prisma 7 connects through a driver adapter, so the pool ceilings below are
 * node-postgres options rather than DATABASE_URL query parameters - the
 * `connection_limit` / `pool_timeout` parameters only apply to the old Prisma
 * query engine and are silently ignored here.
 *
 * Without them the pool size follows the driver default and no statement has an
 * upper bound, so one slow query can hold a connection indefinitely and a burst
 * of traffic queues until the whole service stops answering.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(config: ConfigService) {
    const adapter = new PrismaPg({
      connectionString: process.env.DATABASE_URL,

      // Cap concurrent connections so one instance cannot exhaust PostgreSQL.
      max: config.get<number>('database.poolMax', 10),

      // Fail fast instead of queueing forever when the pool is saturated.
      connectionTimeoutMillis: config.get<number>('database.connectTimeoutMs', 5000),
      idleTimeoutMillis: config.get<number>('database.idleTimeoutMs', 30_000),

      // Server-side ceilings: a runaway query or an abandoned transaction
      // releases its connection instead of holding it for good.
      statement_timeout: config.get<number>('database.statementTimeoutMs', 5000),
      idle_in_transaction_session_timeout: config.get<number>(
        'database.idleInTransactionTimeoutMs',
        10_000,
      ),

      application_name: config.get<string>('subsystemId', 'csmju-lab-booking'),
    });

    super({ adapter });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Connected to the demo subsystem database');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
