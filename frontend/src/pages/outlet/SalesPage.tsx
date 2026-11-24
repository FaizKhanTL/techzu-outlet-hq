import { Fragment, useState } from 'react';
import { useSales } from '../../api/hooks';
import { useUser } from '../../auth/context';
import { endOfDayExclusiveIso, formatDateTime, startOfDayIso } from '../../lib/dates';
import { DateRangeFilter, Empty, ErrorBox, Loading, Money, PageHeader } from '../../components/ui';

const PAGE_SIZE = 20;

export function SalesPage() {
  const { outletId } = useUser();
  const [dates, setDates] = useState({ from: '', to: '' });
  const [offset, setOffset] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const sales = useSales(outletId!, {
    from: startOfDayIso(dates.from),
    to: endOfDayExclusiveIso(dates.to),
    limit: PAGE_SIZE,
    offset,
  });
  const total = sales.data?.meta.total ?? 0;

  return (
    <>
      <PageHeader
        title="Sales"
        subtitle={`${total} sale${total === 1 ? '' : 's'}`}
        actions={
          <DateRangeFilter
            from={dates.from}
            to={dates.to}
            onChange={(range) => {
              setDates(range);
              setOffset(0);
            }}
          />
        }
      />
      <ErrorBox error={sales.error} />
      {sales.isPending ? (
        <Loading />
      ) : sales.data?.data.length ? (
        <section className="card">
          <table>
            <thead>
              <tr>
                <th>Receipt</th>
                <th>Time</th>
                <th className="num">Items</th>
                <th>Payment</th>
                <th className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              {sales.data.data.map((sale) => (
                <Fragment key={sale.id}>
                  <tr
                    className="clickable"
                    onClick={() => setOpen(open === sale.id ? null : sale.id)}
                  >
                    <td className="mono">{sale.receiptNumber}</td>
                    <td>{formatDateTime(sale.createdAt)}</td>
                    <td className="num">{sale.itemCount}</td>
                    <td>{sale.paymentMethod.replace('_', '-')}</td>
                    <td className="num">
                      <Money cents={sale.totalCents} />
                    </td>
                  </tr>
                  {open === sale.id ? (
                    <tr className="details">
                      <td colSpan={5}>
                        {sale.items.map((line) => (
                          <div key={line.menuItemId} className="detail-line">
                            <span>
                              {line.quantity} × {line.name} @ <Money cents={line.unitPriceCents} />
                            </span>
                            <Money cents={line.lineTotalCents} />
                          </div>
                        ))}
                        {sale.note ? <p className="muted">Note: {sale.note}</p> : null}
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
          <div className="pager">
            <button
              type="button"
              className="secondary small"
              disabled={offset === 0}
              onClick={() => setOffset(offset - PAGE_SIZE)}
            >
              Newer
            </button>
            <span className="muted">
              {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
            </span>
            <button
              type="button"
              className="secondary small"
              disabled={offset + PAGE_SIZE >= total}
              onClick={() => setOffset(offset + PAGE_SIZE)}
            >
              Older
            </button>
          </div>
        </section>
      ) : (
        <Empty>No sales in this period.</Empty>
      )}
    </>
  );
}
