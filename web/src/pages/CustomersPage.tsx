import { Card, EmptyState } from '@/components/ui';
import { PageHeader } from '@/components/layout/PageHeader';

export function CustomersPage() {
  return (
    <>
      <PageHeader title="Customers" description="Built from the numbers that message you. Nobody signs up." />
      <Card>
        <EmptyState title="No customers yet" description="A customer record is created the first time someone messages your WhatsApp number." />
      </Card>
    </>
  );
}
