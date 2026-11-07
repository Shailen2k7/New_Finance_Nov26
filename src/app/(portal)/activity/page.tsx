import { getActivity } from "@/lib/activity";
import { PageHeader } from "@/components/ui/misc";
import { PageTabs } from "@/components/layout/page-tabs";
import { ActivityFilters } from "@/components/activity/activity-filters";
import { ActivityTable } from "@/components/activity/activity-table";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

export default async function ActivityPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const filters = { actor: str(sp.actor), entity: str(sp.entity), verb: str(sp.verb), from: str(sp.from), to: str(sp.to), q: str(sp.q), page: Number(str(sp.page) ?? 1) || 1 };
  const data = await getActivity(filters);
  return (
    <div>
      <PageTabs group="settings" />
      <PageHeader title="Activity" description="Every change made in the portal, by whom and when, with the values before and after." />
      <ActivityFilters filters={filters} actors={data.actors} entities={data.entities} />
      <ActivityTable
        rows={data.rows.map((r) => ({ id: r.id, actor: r.actor, action: r.action, entity: r.entity, entityId: r.entityId, summary: r.summary, before: r.before, after: r.after, createdAt: r.createdAt.toISOString() }))}
        total={data.total}
        page={data.page}
        pageSize={data.pageSize}
        filters={filters}
      />
    </div>
  );
}
