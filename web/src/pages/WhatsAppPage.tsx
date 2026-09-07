import { Card, EmptyState } from '@/components/ui';
import { PageHeader } from '@/components/layout/PageHeader';

export function WhatsAppPage() {
  return (
    <>
      <PageHeader title="WhatsApp" description="The number this business takes orders on." />
      <Card>
        <EmptyState title="Connection arrives in sprint 4" description="Meta embedded signup, webhook subscription and the greeting message live here." />
      </Card>
    </>
  );
}
