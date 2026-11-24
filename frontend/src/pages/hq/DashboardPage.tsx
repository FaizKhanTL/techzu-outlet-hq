import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useRevenueReport, useTopItemsReport } from '../../api/hooks';
import { endOfDayExclusiveIso, startOfDayIso } from '../../lib/dates';
import { Badge, DateRangeFilter, ErrorBox, Loading, Money, PageHeader } from '../../components/ui';
import { TopItemsTable } from '../../components/TopItemsTable';

export function DashboardPage() {
  const [dates, setDates] = useState({ from: '', to: '' });
  const range = { from: startOfDayIso(dates.from), to: endOfDayExclusiveIso(dates.to) };
  const revenue = useRevenueReport(range);
  const top = useTopItemsReport({ ...range, limit: 5 });

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Sales across every outlet"
        actions={<DateRangeFilter from={dates.from} to={dates.to} onChange={setDates} />}
      />
      <ErrorBox error={revenue.error ?? top.error} />
      {revenue.isPending ? (
        <Loading />
      ) : revenue.data ? (
        <>
          <section className="kpis">
            <div className="kpi">
              <span>Revenue</span>
              <strong>
                <Money cents={revenue.data.totals.revenueCents} />
              </strong>
            </div>
            <div className="kpi">
              <span>Sales</span>
              <strong>{revenue.data.totals.saleCount}</strong>
            </div>
            <div className="kpi">
              <span>Items sold</span>
              <strong>{revenue.data.totals.itemsSold}</strong>
            </div>
          </section>
          <section className="card">
            <h2>Revenue by outlet</h2>
            <table>
              <thead>
                <tr>
                  <th>Outlet</th>
                  <th className="num">Sales</th>
                  <th className="num">Items</th>
                  <th className="num">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {revenue.data.outlets.map((outlet) => (
                  <tr key={outlet.outletId}>
                    <td>
                      <Link to={`/hq/outlets/${outlet.outletId}`}>{outlet.outletName}</Link>{' '}
                      <small className="muted">{outlet.outletCode}</small>{' '}
                      {outlet.outletIsActive ? null : <Badge tone="grey">Inactive</Badge>}
                    </td>
                    <td className="num">{outlet.saleCount}</td>
                    <td className="num">{outlet.itemsSold}</td>
                    <td className="num">
                      <Money cents={outlet.revenueCents} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      ) : null}
      <h2 className="section-title">Top 5 items per outlet</h2>
      {top.isPending ? (
        <Loading />
      ) : (
        <div className="grid">
          {top.data?.outlets.map((outlet) => (
            <section className="card" key={outlet.outletId}>
              <h3>
                {outlet.outletName} <small className="muted">{outlet.outletCode}</small>
              </h3>
              <TopItemsTable outlet={outlet} />
            </section>
          ))}
        </div>
      )}
    </>
  );
}
