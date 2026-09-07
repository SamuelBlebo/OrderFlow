import { Card, EmptyState } from '@/components/ui';
import { PageHeader } from '@/components/layout/PageHeader';

export function AnalyticsPage() {
  return (
    <>
      <PageHeader title="Analytics" description="Trends across revenue, orders and your best-selling products." />
      <Card>
        <EmptyState
          title="Analytics arrive in sprint 6"
          description="Charts for revenue over time, top products and repeat customers land once enough order history exists."
        />
      </Card>
    </>
  );
}
