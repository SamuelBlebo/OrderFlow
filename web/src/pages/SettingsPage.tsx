import { Card, EmptyState } from '@/components/ui';
import { PageHeader } from '@/components/layout/PageHeader';

export function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" description="Business details, delivery, team and billing." />
      <Card>
        <EmptyState title="Settings arrive in sprint 5" description="Store profile and plan management come once orders are flowing end to end." />
      </Card>
    </>
  );
}
