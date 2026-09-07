import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardBody, CardHeader, EmptyState, Spinner, StatusBadge } from '@/components/ui';
import { PageHeader } from '@/components/layout/PageHeader';
import { useAuth } from '@/hooks/useAuth';
import { useCollection } from '@/hooks/useCollection';
import { recentOrdersQuery } from '@/services';
import { formatDate, formatMoney } from '@/utils/format';

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <Card>
      <CardBody className="p-4">
        <p className="text-xs font-semibold text-muted">{label}</p>
        <p className="mt-1 text-2xl font-bold tracking-tight text-ink">{value}</p>
        {note && <p className="mt-0.5 text-xs text-muted">{note}</p>}
      </CardBody>
    </Card>
  );
}

export function DashboardPage() {
  const { org } = useAuth();
  const orgId = org!.id;
  const query = useMemo(() => recentOrdersQuery(orgId), [orgId]);
  const orders = useCollection(query);

  const rows = orders.status === 'ready' ? orders.data : [];
  const revenue = rows
    .filter((o) => o.status !== 'cancelled')
    .reduce((sum, o) => sum + o.total, 0);
  const pending = rows.filter((o) => o.status === 'pending').length;

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

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Recent revenue" value={formatMoney(revenue, org!.currency)} note="last 5 orders" />
        <Stat label="Needs attention" value={String(pending)} note="orders still pending" />
        <Stat label="Plan" value={org!.subscription.plan} note={org!.subscription.status} />
        <Stat
          label="WhatsApp"
          value={org!.whatsapp.connected ? 'Live' : 'Off'}
          note={org!.whatsapp.displayPhoneNumber ?? 'No number linked'}
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
        {orders.status === 'ready' && rows.length === 0 && (
          <EmptyState
            title="No orders yet"
            description="Once WhatsApp is connected, every order a customer places lands here."
          />
        )}
        {rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                {rows.map((order) => (
                  <tr key={order.id} className="border-b border-line last:border-0">
                    <td className="px-5 py-3 font-semibold text-ink">{order.reference}</td>
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
