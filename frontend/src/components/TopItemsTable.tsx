import type { TopItemsReport } from '../api/types';
import { Empty, Money } from './ui';

export function TopItemsTable({ outlet }: { outlet: TopItemsReport['outlets'][number] }) {
  if (outlet.items.length === 0) return <Empty>No sales in this period.</Empty>;
  return (
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Item</th>
          <th className="num">Sold</th>
          <th className="num">Revenue</th>
        </tr>
      </thead>
      <tbody>
        {outlet.items.map((item) => (
          <tr key={item.menuItemId}>
            <td>{item.rank}</td>
            <td>
              {item.name}
              <small className="muted sku">{item.sku}</small>
            </td>
            <td className="num">{item.quantitySold}</td>
            <td className="num">
              <Money cents={item.revenueCents} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
