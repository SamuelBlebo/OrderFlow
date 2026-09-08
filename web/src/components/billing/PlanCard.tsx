import { Button, Card, CardBody } from '@/components/ui';
import { cn } from '@/utils/cn';
import type { PlanDefinition } from '@/config/plans';

export function PlanCard({
  plan,
  isCurrent,
  busy,
  onSelect,
}: {
  plan: PlanDefinition;
  isCurrent: boolean;
  busy?: boolean;
  onSelect: () => void;
}) {
  return (
    <Card className={cn(isCurrent && 'border-brand ring-1 ring-brand')}>
      <CardBody className="flex h-full flex-col gap-4 p-5">
        <div>
          <p className="text-sm font-semibold text-ink">{plan.name}</p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-ink">
            {plan.priceUsd === 0 ? 'Free' : `$${plan.priceUsd}`}
            {plan.priceUsd > 0 && <span className="text-sm font-normal text-muted"> /mo</span>}
          </p>
        </div>
        <ul className="space-y-1.5 text-sm text-muted">
          {plan.features.map((feature) => (
            <li key={feature} className="flex items-start gap-2">
              <span className="mt-0.5 text-brand" aria-hidden>
                ✓
              </span>
              {feature}
            </li>
          ))}
        </ul>
        <Button
          type="button"
          variant={isCurrent ? 'secondary' : 'primary'}
          disabled={isCurrent}
          loading={busy}
          onClick={onSelect}
          className="mt-auto"
        >
          {isCurrent ? 'Current plan' : 'Choose plan'}
        </Button>
      </CardBody>
    </Card>
  );
}
