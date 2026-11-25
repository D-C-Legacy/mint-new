import { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  getOrdersByStatus,
  getOrdersSummary,
  getPayoutsSummary,
  getPlatformMetrics,
  getSellersSummary,
  type OrdersSummaryPoint,
  type PayoutStatusSummary,
  type SellersSummary,
  type StatusCount,
  type AnalyticsGranularity,
  type PlatformMetricsSummary,
} from '../../api/analytics';
import { ApiError } from '../../lib/api-client';
import { formatMoney } from '../../lib/money';
import { Section } from '../../components/Section';
import { colors, spacing, radii, typography } from '../../theme';
import {
  CHART_INK,
  SEQUENTIAL_PRIMARY,
  SEQUENTIAL_SECONDARY,
  orderStatusColor,
  payoutStatusColor,
  sellerStatusColor,
} from '../../lib/chartColors';

const GRANULARITIES: { label: string; value: AnalyticsGranularity }[] = [
  { label: 'Daily', value: 'day' },
  { label: 'Weekly', value: 'week' },
  { label: 'Monthly', value: 'month' },
  { label: 'Quarterly', value: 'quarter' },
  { label: 'Yearly', value: 'year' },
];

function rangeForGranularity(granularity: AnalyticsGranularity, to: Date): Date {
  const from = new Date(to);
  if (granularity === 'day') from.setDate(from.getDate() - 30);
  if (granularity === 'week') from.setDate(from.getDate() - 84);
  if (granularity === 'month') from.setMonth(from.getMonth() - 12);
  if (granularity === 'quarter') from.setMonth(from.getMonth() - 24);
  if (granularity === 'year') from.setFullYear(from.getFullYear() - 5);
  return from;
}

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function AnalyticsPage() {
  const [granularity, setGranularity] = useState<AnalyticsGranularity>('day');
  const [currency, setCurrency] = useState('USD');
  const [ordersSummary, setOrdersSummary] = useState<OrdersSummaryPoint[]>([]);
  const [ordersByStatus, setOrdersByStatus] = useState<StatusCount[]>([]);
  const [sellersSummary, setSellersSummary] = useState<SellersSummary | null>(null);
  const [payoutsSummary, setPayoutsSummary] = useState<PayoutStatusSummary[]>([]);
  const [platformMetrics, setPlatformMetrics] = useState<PlatformMetricsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const to = new Date();
        const from = rangeForGranularity(granularity, to);
        const [orders, byStatus, sellers, payouts, metrics] = await Promise.all([
          getOrdersSummary({ from, to }),
          getOrdersByStatus(),
          getSellersSummary({ from, to }),
          getPayoutsSummary(),
          getPlatformMetrics({ from, to }, granularity),
        ]);
        setOrdersSummary(orders);
        setOrdersByStatus(byStatus);
        setSellersSummary(sellers);
        setPayoutsSummary(payouts);
        setPlatformMetrics(metrics);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Failed to load analytics.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [granularity]);

  const totalOrders = ordersSummary.reduce((sum, p) => sum + p.orderCount, 0);
  const currencies = [...new Set((platformMetrics?.periods ?? []).map((period) => period.currency))];
  const selectedCurrency = currencies.includes(currency) ? currency : currencies[0] ?? currency;
  const currencyPeriods = (platformMetrics?.periods ?? []).filter((period) => period.currency === selectedCurrency);
  const totalGmv = currencyPeriods.reduce((sum, period) => sum + period.gmv, 0);
  const totalCommission = currencyPeriods.reduce((sum, period) => sum + period.commission, 0);
  const takeRate = totalGmv > 0 ? (totalCommission / totalGmv) * 100 : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xl }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ fontSize: typography.section, color: colors.text, margin: 0 }}>Analytics</h1>
        <div style={{ display: 'flex', gap: spacing.xs }}>
          {GRANULARITIES.map((r) => (
            <button
              key={r.value}
              onClick={() => setGranularity(r.value)}
              style={{
                border: 'none',
                borderRadius: radii.button,
                padding: `${spacing.xs}px ${spacing.md}px`,
                background: granularity === r.value ? colors.brand : colors.canvas,
                color: granularity === r.value ? colors.canvas : colors.text,
                fontSize: typography.body,
                fontWeight: granularity === r.value ? 600 : 400,
                cursor: 'pointer',
              }}
            >
              {r.label}
            </button>
          ))}
          <select aria-label="Analytics currency" value={selectedCurrency} onChange={(event) => setCurrency(event.target.value)} style={{ border: `1px solid ${colors.line}`, borderRadius: radii.button, padding: `${spacing.xs}px ${spacing.md}px`, background: colors.canvas, color: colors.text }}>
            {(currencies.length ? currencies : [currency]).map((code) => <option key={code} value={code}>{code}</option>)}
          </select>
        </div>
      </div>

      {error && <div style={{ color: colors.urgent, fontSize: typography.body }}>{error}</div>}
      {loading && <div style={{ color: colors.textSecondary }}>Loading…</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing.lg }}>
        <StatTile label="All-time buyers with paid orders" value={String(platformMetrics?.uniqueActiveBuyers ?? 0)} />
        <StatTile label="GMV in range (item value, net of refunds)" value={formatMoney(totalGmv, selectedCurrency)} />
        <StatTile label="Commission" value={formatMoney(totalCommission, selectedCurrency)} />
        <StatTile label="Take rate" value={takeRate === null ? '—' : `${takeRate.toFixed(2)}%`} />
        <StatTile label="Total sellers" value={String(platformMetrics?.totalSellers ?? 0)} />
        <StatTile label="Total users" value={String(platformMetrics?.totalUsers ?? 0)} />
        <StatTile label="Orders" value={String(totalOrders)} />
      </div>

      <Section title="GMV over time">
        {currencyPeriods.length === 0 && !loading ? (
          <EmptyNote text="No paid orders in this range." />
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={currencyPeriods.map((p) => ({ ...p, day: p.periodStart }))} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={CHART_INK.grid} vertical={false} />
              <XAxis
                dataKey="day"
                tickFormatter={formatDay}
                stroke={CHART_INK.axis}
                tick={{ fill: CHART_INK.muted, fontSize: 12 }}
              />
              <YAxis stroke={CHART_INK.axis} tick={{ fill: CHART_INK.muted, fontSize: 12 }} width={70} />
              <Tooltip
                formatter={(value: number) => formatMoney(value, selectedCurrency)}
                labelFormatter={(label: string) => formatDay(label)}
              />
              <Line
                type="monotone"
                dataKey="gmv"
                name="GMV"
                stroke={SEQUENTIAL_PRIMARY}
                strokeWidth={2}
                dot={{ r: 4, fill: SEQUENTIAL_PRIMARY }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </Section>

      <Section title="Active buyers over time">
        {(platformMetrics?.activeBuyersPeriods.length ?? 0) === 0 && !loading ? <EmptyNote text="No paid orders in this range." /> : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={(platformMetrics?.activeBuyersPeriods ?? []).map((p) => ({ ...p, day: p.periodStart }))} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={CHART_INK.grid} vertical={false} />
              <XAxis dataKey="day" tickFormatter={formatDay} stroke={CHART_INK.axis} tick={{ fill: CHART_INK.muted, fontSize: 12 }} />
              <YAxis stroke={CHART_INK.axis} tick={{ fill: CHART_INK.muted, fontSize: 12 }} width={40} allowDecimals={false} />
              <Tooltip labelFormatter={(label: string) => formatDay(label)} />
              <Line type="monotone" dataKey="activeBuyers" name="Buyers" stroke={SEQUENTIAL_SECONDARY} strokeWidth={2} dot={{ r: 4, fill: SEQUENTIAL_SECONDARY }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </Section>

      <Section title="Commission over time">
        {currencyPeriods.length === 0 && !loading ? <EmptyNote text="No paid orders in this range." /> : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={currencyPeriods.map((p) => ({ ...p, day: p.periodStart }))} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={CHART_INK.grid} vertical={false} />
              <XAxis dataKey="day" tickFormatter={formatDay} stroke={CHART_INK.axis} tick={{ fill: CHART_INK.muted, fontSize: 12 }} />
              <YAxis stroke={CHART_INK.axis} tick={{ fill: CHART_INK.muted, fontSize: 12 }} width={70} />
              <Tooltip formatter={(value: number) => formatMoney(value, selectedCurrency)} labelFormatter={(label: string) => formatDay(label)} />
              <Line type="monotone" dataKey="commission" name="Commission" stroke={SEQUENTIAL_SECONDARY} strokeWidth={2} dot={{ r: 4, fill: SEQUENTIAL_SECONDARY }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </Section>

      <Section title="Take rate over time">
        {currencyPeriods.length === 0 && !loading ? <EmptyNote text="No paid orders in this range." /> : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={currencyPeriods.map((p) => ({ ...p, day: p.periodStart }))} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={CHART_INK.grid} vertical={false} />
              <XAxis dataKey="day" tickFormatter={formatDay} stroke={CHART_INK.axis} tick={{ fill: CHART_INK.muted, fontSize: 12 }} />
              <YAxis stroke={CHART_INK.axis} tick={{ fill: CHART_INK.muted, fontSize: 12 }} width={55} unit="%" />
              <Tooltip formatter={(value) => typeof value === 'number' ? `${value.toFixed(2)}%` : '—'} labelFormatter={(label: string) => formatDay(label)} />
              <Line type="monotone" dataKey="takeRatePercent" name="Take rate" stroke={SEQUENTIAL_PRIMARY} strokeWidth={2} dot={{ r: 4, fill: SEQUENTIAL_PRIMARY }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        )}
      </Section>

      <Section title="Orders over time">
        {ordersSummary.length === 0 && !loading ? (
          <EmptyNote text="No PAID/COMPLETED orders in this range." />
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={ordersSummary} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={CHART_INK.grid} vertical={false} />
              <XAxis
                dataKey="day"
                tickFormatter={formatDay}
                stroke={CHART_INK.axis}
                tick={{ fill: CHART_INK.muted, fontSize: 12 }}
              />
              <YAxis stroke={CHART_INK.axis} tick={{ fill: CHART_INK.muted, fontSize: 12 }} width={40} allowDecimals={false} />
              <Tooltip labelFormatter={(label: string) => formatDay(label)} />
              <Line
                type="monotone"
                dataKey="orderCount"
                name="Orders"
                stroke={SEQUENTIAL_SECONDARY}
                strokeWidth={2}
                dot={{ r: 4, fill: SEQUENTIAL_SECONDARY }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </Section>

      <Section title="Orders by status (current)">
        {ordersByStatus.length === 0 && !loading ? (
          <EmptyNote text="No orders yet." />
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={ordersByStatus} margin={{ top: 8, right: 16, left: 16, bottom: 0 }}>
              <CartesianGrid stroke={CHART_INK.grid} vertical={false} />
              <XAxis
                dataKey="status"
                stroke={CHART_INK.axis}
                tick={{ fill: CHART_INK.muted, fontSize: 11 }}
                interval={0}
                angle={-20}
                textAnchor="end"
                height={60}
                padding={{ left: 20, right: 20 }}
              />
              <YAxis stroke={CHART_INK.axis} tick={{ fill: CHART_INK.muted, fontSize: 12 }} width={40} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" name="Orders" radius={[4, 4, 0, 0]}>
                {ordersByStatus.map((row) => (
                  <Cell key={row.status} fill={orderStatusColor(row.status)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </Section>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing.lg }}>
        <Section title="Seller approvals over time">
          {!sellersSummary || sellersSummary.approvalsOverTime.length === 0 ? (
            <EmptyNote text="No approvals in this range." />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={sellersSummary.approvalsOverTime} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={CHART_INK.grid} vertical={false} />
                <XAxis dataKey="day" tickFormatter={formatDay} stroke={CHART_INK.axis} tick={{ fill: CHART_INK.muted, fontSize: 12 }} />
                <YAxis stroke={CHART_INK.axis} tick={{ fill: CHART_INK.muted, fontSize: 12 }} width={40} allowDecimals={false} />
                <Tooltip labelFormatter={(label: string) => formatDay(label)} />
                <Line
                  type="monotone"
                  dataKey="approvalCount"
                  name="Approvals"
                  stroke={SEQUENTIAL_SECONDARY}
                  strokeWidth={2}
                  dot={{ r: 4, fill: SEQUENTIAL_SECONDARY }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </Section>

        <Section title="Sellers by status (current)">
          {!sellersSummary || sellersSummary.byStatus.length === 0 ? (
            <EmptyNote text="No sellers yet." />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={sellersSummary.byStatus} margin={{ top: 8, right: 16, left: 16, bottom: 0 }}>
                <CartesianGrid stroke={CHART_INK.grid} vertical={false} />
                <XAxis
                  dataKey="status"
                  stroke={CHART_INK.axis}
                  tick={{ fill: CHART_INK.muted, fontSize: 11 }}
                  interval={0}
                  padding={{ left: 20, right: 20 }}
                />
                <YAxis stroke={CHART_INK.axis} tick={{ fill: CHART_INK.muted, fontSize: 12 }} width={40} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" name="Sellers" radius={[4, 4, 0, 0]}>
                  {sellersSummary.byStatus.map((row) => (
                    <Cell key={row.status} fill={sellerStatusColor(row.status)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Section>
      </div>

      <Section title="Payout totals by status (current)">
        {payoutsSummary.length === 0 && !loading ? (
          <EmptyNote text="No payouts yet." />
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={payoutsSummary} margin={{ top: 8, right: 16, left: 16, bottom: 0 }}>
              <CartesianGrid stroke={CHART_INK.grid} vertical={false} />
              <XAxis
                dataKey="status"
                stroke={CHART_INK.axis}
                tick={{ fill: CHART_INK.muted, fontSize: 12 }}
                interval={0}
                padding={{ left: 20, right: 20 }}
              />
              <YAxis
                stroke={CHART_INK.axis}
                tick={{ fill: CHART_INK.muted, fontSize: 12 }}
                width={70}
                tickFormatter={(v: number) => formatMoney(v, 'USD')}
              />
              <Tooltip formatter={(value: number) => formatMoney(value, 'USD')} />
              <Bar dataKey="totalAmount" name="Total amount" radius={[4, 4, 0, 0]}>
                {payoutsSummary.map((row) => (
                  <Cell key={row.status} fill={payoutStatusColor(row.status)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </Section>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        background: colors.canvas,
        borderRadius: radii.cardLarge,
        border: `1px solid ${colors.line}`,
        padding: spacing.lg,
      }}
    >
      <div style={{ fontSize: typography.meta, color: colors.textSecondary }}>{label}</div>
      <div style={{ fontSize: typography.title, color: colors.text, fontWeight: 700, marginTop: spacing.xs }}>
        {value}
      </div>
    </div>
  );
}

function EmptyNote({ text }: { text: string }) {
  return <div style={{ color: colors.textSecondary, fontSize: typography.body, padding: spacing.lg }}>{text}</div>;
}
