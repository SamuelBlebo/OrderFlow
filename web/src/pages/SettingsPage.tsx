import { useMemo, useState } from 'react';
import { Card, CardBody, CardHeader } from '@/components/ui';
import { PageHeader } from '@/components/layout/PageHeader';
import { PlanCard } from '@/components/billing/PlanCard';
import { UsageMeter } from '@/components/billing/UsageMeter';
import { useAuth } from '@/hooks/useAuth';
import { useCollection } from '@/hooks/useCollection';
import { useToast } from '@/hooks/useToast';
import { changePlan, productsQuery } from '@/services';
import { PLAN_CATALOG, PLAN_ORDER } from '@/config/plans';
import type { PlanId } from '@/types';
import { toMessage } from '@/utils/errors';

export function SettingsPage() {
  const { org } = useAuth();
  const orgId = org!.id;
  const toast = useToast();
  const products = useCollection(useMemo(() => productsQuery(orgId), [orgId]));
  const productCount = products.status === 'ready' ? products.data.length : 0;

  const [changingPlan, setChangingPlan] = useState<PlanId | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);

  const currentPlan = PLAN_CATALOG[org!.subscription.plan];
  const ordersUsed = org!.subscription.ordersUsedThisPeriod ?? 0;

  const selectPlan = async (plan: PlanId) => {
    if (plan === org!.subscription.plan) return;
    setChangingPlan(plan);
    setPlanError(null);
    try {
      await changePlan(plan);
      toast.success(`Switched to the ${PLAN_CATALOG[plan].name} plan.`);
    } catch (error) {
      setPlanError(toMessage(error));
    } finally {
      setChangingPlan(null);
    }
  };

  return (
    <>
      <PageHeader title="Settings" description="Business details, delivery, team and billing." />

      <Card className="mb-6">
        <CardHeader
          title="Plan & usage"
          description={`You're on the ${currentPlan.name} plan${org!.subscription.status === 'trialing' ? ' (trial)' : ''}.`}
        />
        <CardBody className="space-y-4">
          <UsageMeter label="Products" used={productCount} limit={currentPlan.productLimit} />
          <UsageMeter label="Orders this month" used={ordersUsed} limit={currentPlan.orderLimit} />
        </CardBody>
      </Card>

      {planError && (
        <p className="mb-4 rounded-xl bg-danger/10 px-3 py-2 text-sm font-medium text-danger">{planError}</p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {PLAN_ORDER.map((planId) => (
          <PlanCard
            key={planId}
            plan={PLAN_CATALOG[planId]}
            isCurrent={planId === org!.subscription.plan}
            busy={changingPlan === planId}
            onSelect={() => selectPlan(planId)}
          />
        ))}
      </div>
    </>
  );
}
