import { Inject, Injectable } from '@nestjs/common';
import {
  ANALYTICS_REPOSITORY,
  AnalyticsRepositoryPort,
} from '../../domain/ports/analytics.repository.port';
import { AnalyticsGranularity, PlatformMetricsSummary } from '../../domain/entities/analytics.entity';
import { AnalyticsRangeCommand, resolveAnalyticsRange } from '../../../../shared/analytics/analytics-range.util';

export interface GetPlatformMetricsCommand extends AnalyticsRangeCommand {
  readonly granularity: AnalyticsGranularity;
}

@Injectable()
export class GetPlatformMetricsQuery {
  constructor(@Inject(ANALYTICS_REPOSITORY) private readonly analytics: AnalyticsRepositoryPort) {}

  async execute(cmd: GetPlatformMetricsCommand): Promise<PlatformMetricsSummary> {
    return this.analytics.platformMetrics(resolveAnalyticsRange(cmd), cmd.granularity);
  }
}
