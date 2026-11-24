import { useState } from 'react';
import { useTopItemsReport } from '../../api/hooks';
import { endOfDayExclusiveIso, startOfDayIso } from '../../lib/dates';
import { DateRangeFilter, ErrorBox, Loading, PageHeader } from '../../components/ui';
import { TopItemsTable } from '../../components/TopItemsTable';

export function OutletReportsPage() {
  const [dates, setDates] = useState({ from: '', to: '' });
  // Staff always get their own outlet: the API applies it from the signed-in user.
  const top = useTopItemsReport({
    from: startOfDayIso(dates.from),
    to: endOfDayExclusiveIso(dates.to),
    limit: 5,
  });
  const outlet = top.data?.outlets[0];

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle="Top 5 items at this outlet"
        actions={<DateRangeFilter from={dates.from} to={dates.to} onChange={setDates} />}
      />
      <ErrorBox error={top.error} />
      {top.isPending ? (
        <Loading />
      ) : outlet ? (
        <section className="card">
          <TopItemsTable outlet={outlet} />
        </section>
      ) : null}
    </>
  );
}
