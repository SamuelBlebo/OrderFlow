import { Card, EmptyState } from '@/components/ui';
import { PageHeader } from '@/components/layout/PageHeader';

export function OrdersPage() {
  return (
    <>
      <PageHeader title="Orders" description="Every order a customer placed in a WhatsApp chat." />
      <Card>
        <EmptyState title="Orders arrive in sprint 3" description="The list, the detail view and the status buttons that message the customer land next." />
      </Card>
    </>
  );
}
