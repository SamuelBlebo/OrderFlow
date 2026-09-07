import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardBody, CardHeader, EmptyState, Spinner, StatusBadge } from '@/components/ui';
import { PageHeader } from '@/components/layout/PageHeader';
import { useAuth } from '@/hooks/useAuth';
import { useCollection } from '@/hooks/useCollection';
import { ordersQuery, productsQuery, LOW_STOCK_THRESHOLD } from '@/services';
import { formatDate, formatMoney } from '@/utils/format';
import { cn } from '@/utils/cn';

type Tone = 'brand' | 'info' | 'warn' | 'danger' | 'muted';

const TONE_STYLES: Record<Tone, string> = {
  brand: 'bg-brand/10 text-brand',
  info: 'bg-info/10 text-info',
  warn: 'bg-warn/10 text-warn',
  danger: 'bg-danger/10 text-danger',
  muted: 'bg-raised text-muted',
};

function StatCard({
  icon,
  tone,
  label,
  value,
  note,
}: {
  icon: string;
  tone: Tone;
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <Card>
      <CardBody className="flex items-start gap-3.5 p-4 sm:p-5">
        <span
          aria-hidden
          className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-xl text-lg', TONE_STYLES[tone])}
        >
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-muted">{label}</p>
          <p className="mt-1 truncate text-2xl font-bold tracking-tight text-ink">{value}</p>
          {note && <p className="mt-0.5 truncate text-xs text-muted">{note}</p>}
        </div>
      </CardBody>
    </Card>
  );
}

export function DashboardPage() {
  const { org } = useAuth();
  const orgId = org!.id;

  const orders = useCollection(useMemo(() => ordersQuery(orgId), [orgId]));
  const products = useCollection(useMemo(() => productsQuery(orgId), [orgId]));

  const orderRows = orders.status === 'ready' ? orders.data : [];
  const productRows = products.status === 'ready' ? products.data : [];
  const statsLoading = orders.status === 'loading' || products.status === 'loading';

  const revenue = orderRows
    .filter((o) => o.status !== 'cancelled')
    .reduce((sum, o) => sum + o.total, 0);
  const totalOrders = orderRows.length;
  const pendingCount = orderRows.filter((o) => o.status === 'pending').length;
  const lowStockCount = productRows.filter((p) => p.stock <= LOW_STOCK_THRESHOLD).length;
  const recentRows = orderRows.slice(0, 5);

  return (
    <>
      <PageHeader title="Dashboard" description="What has come in through WhatsApp today." />

      {!org!.whatsapp.connected && (
        <Card className="mb-6 border-warn/40">
          <CardBody className="flex flex-wrap items-center gap-3 p-4">
            <p className="text-sm text-ink">
              <strong>WhatsApp is not connected.</strong> Orders cannot reach you yet.
            </p>
            <Link to="/whatsapp" className="text-sm font-semibold text-brand">
              Connect it now
            </Link>
          </CardBody>
        </Card>
      )}

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon="◎"
          tone="brand"
          label="Revenue"
          value={statsLoading ? '—' : formatMoney(revenue, org!.currency)}
          note="All time, excludes cancelled"
        />
        <StatCard
          icon="☰"
          tone="info"
          label="Orders"
          value={statsLoading ? '—' : totalOrders.toLocaleString()}
          note="All time total"
        />
        <StatCard
          icon="◔"
          tone={pendingCount > 0 ? 'warn' : 'muted'}
          label="Pending Orders"
          value={statsLoading ? '—' : pendingCount.toLocaleString()}
          note="Waiting on you"
        />
        <StatCard
          icon="▲"
          tone={lowStockCount > 0 ? 'danger' : 'muted'}
          label="Low Stock"
          value={statsLoading ? '—' : lowStockCount.toLocaleString()}
          note={`${LOW_STOCK_THRESHOLD} units or fewer`}
        />
      </div>

      <Card>
        <CardHeader
          title="Recent orders"
          action={
            <Link to="/orders" className="text-sm font-semibold text-brand">
              See all
            </Link>
          }
        />
        {orders.status === 'loading' && (
          <div className="grid place-items-center py-12">
            <Spinner />
          </div>
        )}
        {orders.status === 'error' && (
          <EmptyState title="Orders did not load" description={orders.error} />
        )}
        {orders.status === 'ready' && recentRows.length === 0 && (
          <EmptyState
            title="No orders yet"
            description="Once WhatsApp is connected, every order a customer places lands here."
          />
        )}
        {recentRows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                {recentRows.map((order) => (
                  <tr key={order.id} className="border-b border-line last:border-0">
                    <td className="px-5 py-3 font-semibold text-ink">#{order.number}</td>
                    <td className="px-5 py-3 text-muted">{order.customerName}</td>
                    <td className="px-5 py-3 font-semibold text-ink">
                      {formatMoney(order.total, org!.currency)}
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge status={order.status} />
                    </td>
                    <td className="px-5 py-3 text-xs text-muted">{formatDate(order.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
