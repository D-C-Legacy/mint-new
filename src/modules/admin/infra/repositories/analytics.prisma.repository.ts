import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../platform/database/prisma.service';
import { AnalyticsRepositoryPort, DateRange } from '../../domain/ports/analytics.repository.port';
import {
  OrdersSummaryPoint,
  PayoutStatusSummary,
  SellerApprovalPoint,
  SellersSummary,
  StatusCount,
  AnalyticsGranularity,
  PlatformMetricsSummary,
} from '../../domain/entities/analytics.entity';

// Prisma's query builder can't `date_trunc` a column directly (no groupBy-by-expression support),
// so the day-bucketed queries go straight to `$queryRaw` — same precedent LedgerPrismaRepository
// already set (findUnbalancedTransactionIds' own comment). All identifiers interpolated via
// `Prisma.raw` below are fixed strings this file writes, never request data, so this is safe as
// parameterized raw SQL (`${range.from}`/`${range.to}` ARE proper bound parameters, not raw text).
@Injectable()
export class AnalyticsPrismaRepository implements AnalyticsRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async platformMetrics(range: DateRange, granularity: AnalyticsGranularity): Promise<PlatformMetricsSummary> {
    const dateBucket = Prisma.raw(`'${granularity}'`);
    const [periods, totals, activeBuyersPeriods] = await Promise.all([
      this.prisma.$queryRaw<PlatformMetricsSummary['periods'][number][]>(Prisma.sql`
        WITH refunds AS (
          SELECT p."orderId", SUM(r."amount")::bigint AS "amount"
          FROM "Payment" p
          JOIN "Refund" r ON r."paymentId" = p."id" AND r."status" = 'SUCCEEDED'
          GROUP BY p."orderId"
        ), eligible AS (
          SELECT COALESCE(p."capturedAt", o."createdAt") AS "paidAt", o."buyerUserId", o."currency",
            GREATEST(o."itemAmount" - LEAST(COALESCE(r."amount", 0), o."itemAmount"), 0)::bigint AS gmv,
            GREATEST(o."commissionAmount" - CASE
              WHEN o."itemAmount" > 0 THEN (o."commissionAmount" * LEAST(COALESCE(r."amount", 0), o."itemAmount")) / o."itemAmount"
              ELSE 0 END, 0)::bigint AS commission
          FROM "Order" o
          JOIN "Payment" p ON p."orderId" = o."id" AND p."status" IN ('SUCCEEDED', 'PARTIALLY_REFUNDED')
          LEFT JOIN refunds r ON r."orderId" = o."id"
          WHERE o."status" IN ('PAID', 'SHIPPED', 'DELIVERED', 'COMPLETED')
            AND COALESCE(p."capturedAt", o."createdAt") >= ${range.from}
            AND COALESCE(p."capturedAt", o."createdAt") < ${range.to}
        ), grouped AS (
          SELECT date_trunc(${dateBucket}, "paidAt") AS "periodStart", currency,
            COALESCE(SUM(gmv), 0)::bigint AS gmv,
            COALESCE(SUM(commission), 0)::bigint AS commission
          FROM eligible GROUP BY 1, currency
        )
        SELECT "periodStart", currency, gmv, commission,
          CASE WHEN gmv > 0 THEN ROUND(commission::numeric * 100 / gmv, 4)::float8 ELSE NULL END AS "takeRatePercent"
        FROM grouped ORDER BY "periodStart" ASC, currency ASC
      `),
      this.prisma.$queryRaw<{ uniqueActiveBuyers: number; totalUsers: number; totalSellers: number }[]>(Prisma.sql`
        SELECT (SELECT COUNT(*)::int FROM "User") AS "totalUsers",
               (SELECT COUNT(*)::int FROM "Seller") AS "totalSellers",
               (SELECT COUNT(DISTINCT o."buyerUserId")::int FROM "Order" o
                JOIN "Payment" p ON p."orderId" = o."id" AND p."status" IN ('SUCCEEDED', 'PARTIALLY_REFUNDED')
                WHERE o."status" IN ('PAID', 'SHIPPED', 'DELIVERED', 'COMPLETED')
               ) AS "uniqueActiveBuyers"
      `),
      this.prisma.$queryRaw<{ periodStart: Date; activeBuyers: number }[]>(Prisma.sql`
        SELECT date_trunc(${dateBucket}, COALESCE(p."capturedAt", o."createdAt")) AS "periodStart",
               COUNT(DISTINCT o."buyerUserId")::int AS "activeBuyers"
        FROM "Order" o
        JOIN "Payment" p ON p."orderId" = o."id" AND p."status" IN ('SUCCEEDED', 'PARTIALLY_REFUNDED')
        WHERE o."status" IN ('PAID', 'SHIPPED', 'DELIVERED', 'COMPLETED')
          AND COALESCE(p."capturedAt", o."createdAt") >= ${range.from}
          AND COALESCE(p."capturedAt", o."createdAt") < ${range.to}
        GROUP BY 1 ORDER BY 1 ASC
      `),
    ]);
    const summary = totals[0];
    return {
      uniqueActiveBuyers: summary?.uniqueActiveBuyers ?? 0,
      totalUsers: summary?.totalUsers ?? 0,
      totalSellers: summary?.totalSellers ?? 0,
      periods,
      activeBuyersPeriods,
    };
  }

  // Shared shape every day-bucketed query here follows: one table, one date column, an optional
  // extra predicate, some aggregate select list. `selectSql`/`whereSql` are composed by each
  // caller from fixed, hand-written fragments — never from user input.
  private async bucketByDay<T extends { day: Date }>(
    tableName: string,
    dateColumn: string,
    selectSql: Prisma.Sql,
    whereSql: Prisma.Sql,
    range: DateRange,
  ): Promise<T[]> {
    const col = Prisma.raw(`"${dateColumn}"`);
    const table = Prisma.raw(`"${tableName}"`);
    return this.prisma.$queryRaw<T[]>(Prisma.sql`
      SELECT date_trunc('day', ${col}) AS day, ${selectSql}
      FROM ${table}
      WHERE ${whereSql} AND ${col} >= ${range.from} AND ${col} < ${range.to}
      GROUP BY day
      ORDER BY day ASC
    `);
  }

  async ordersSummary(range: DateRange): Promise<readonly OrdersSummaryPoint[]> {
    return this.bucketByDay<OrdersSummaryPoint>(
      'Order',
      'createdAt',
      Prisma.sql`COUNT(*)::int AS "orderCount", COALESCE(SUM("totalAmount"), 0)::bigint AS revenue`,
      Prisma.sql`status IN ('PAID', 'COMPLETED')`,
      range,
    );
  }

  async ordersByStatus(): Promise<readonly StatusCount[]> {
    const rows = await this.prisma.order.groupBy({ by: ['status'], _count: { status: true } });
    return rows.map((row) => ({ status: row.status, count: row._count.status }));
  }

  async sellersSummary(range: DateRange): Promise<SellersSummary> {
    const [byStatusRows, approvalsOverTime] = await Promise.all([
      this.prisma.seller.groupBy({ by: ['status'], _count: { status: true } }),
      this.bucketByDay<SellerApprovalPoint>(
        'Seller',
        'approvedAt',
        Prisma.sql`COUNT(*)::int AS "approvalCount"`,
        Prisma.sql`"approvedAt" IS NOT NULL`,
        range,
      ),
    ]);
    return {
      byStatus: byStatusRows.map((row) => ({ status: row.status, count: row._count.status })),
      approvalsOverTime,
    };
  }

  async payoutsSummary(): Promise<readonly PayoutStatusSummary[]> {
    const rows = await this.prisma.payout.groupBy({
      by: ['status'],
      _count: { status: true },
      _sum: { amount: true },
    });
    return rows.map((row) => ({
      status: row.status,
      count: row._count.status,
      totalAmount: row._sum.amount ?? 0n,
    }));
  }
}
