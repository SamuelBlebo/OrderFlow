import { Card, EmptyState } from '@/components/ui';
import { PageHeader } from '@/components/layout/PageHeader';

export function ProductsPage() {
  return (
    <>
      <PageHeader title="Products" description="This catalogue is exactly what the bot shows a customer." />
      <Card>
        <EmptyState title="Products arrive in sprint 2" description="Adding, editing, photos and stock come next, wired to Firestore and Storage." />
      </Card>
    </>
  );
}
