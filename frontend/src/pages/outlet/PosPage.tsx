import { useMemo, useReducer, useState } from 'react';
import { useCreateSale, useOutletMenu } from '../../api/hooks';
import { ApiError } from '../../api/client';
import type { OutletMenuItem, PaymentMethod, Sale } from '../../api/types';
import { useUser } from '../../auth/context';
import { cartItemCount, cartReducer, cartTotalCents } from '../../lib/cart';
import { formatDateTime } from '../../lib/dates';
import { Empty, ErrorBox, Loading, Modal, Money, PageHeader } from '../../components/ui';

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'CASH', label: 'Cash' },
  { value: 'CARD', label: 'Card' },
  { value: 'E_WALLET', label: 'E-wallet' },
];

function Receipt({ sale }: { sale: Sale }) {
  return (
    <div className="receipt">
      <p className="receipt-number">{sale.receiptNumber}</p>
      <p className="muted">{formatDateTime(sale.createdAt)}</p>
      <table>
        <tbody>
          {sale.items.map((line) => (
            <tr key={line.menuItemId}>
              <td>
                {line.quantity} × {line.name}
              </td>
              <td className="num">
                <Money cents={line.lineTotalCents} />
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th>Total ({sale.paymentMethod.replace('_', '-').toLowerCase()})</th>
            <th className="num">
              <Money cents={sale.totalCents} />
            </th>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export function PosPage() {
  const { outletId } = useUser();
  const menu = useOutletMenu(outletId!, true);
  const createSale = useCreateSale(outletId!);
  const [cart, dispatch] = useReducer(cartReducer, []);
  const [payment, setPayment] = useState<PaymentMethod>('CASH');
  const [note, setNote] = useState('');
  const [receipt, setReceipt] = useState<Sale | null>(null);
  // One key per checkout attempt; a new cart or a finished sale gets a new one.
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  const menuItems = menu.data;
  const categories = useMemo(() => {
    const groups = new Map<string, OutletMenuItem[]>();
    for (const item of menuItems ?? [])
      groups.set(item.category, [...(groups.get(item.category) ?? []), item]);
    return [...groups];
  }, [menuItems]);

  const changeCart = (action: Parameters<typeof dispatch>[0]) => {
    dispatch(action);
    setIdempotencyKey(crypto.randomUUID());
    createSale.reset();
  };

  const checkout = () => {
    createSale.mutate(
      {
        idempotencyKey,
        items: cart.map((line) => ({ menuItemId: line.menuItemId, quantity: line.quantity })),
        paymentMethod: payment,
        note: note || null,
      },
      {
        onSuccess: (res) => {
          setReceipt(res.data);
          dispatch({ type: 'clear' });
          setNote('');
          setIdempotencyKey(crypto.randomUUID());
        },
      },
    );
  };

  const stockProblem =
    createSale.error instanceof ApiError && createSale.error.code === 'INSUFFICIENT_STOCK';

  return (
    <>
      <PageHeader
        title="Point of sale"
        subtitle="Items on this outlet's menu that can be sold now"
      />
      <div className="pos">
        <div className="pos-menu">
          <ErrorBox error={menu.error} />
          {menu.isPending ? (
            <Loading />
          ) : categories.length === 0 ? (
            <Empty>Nothing on this outlet&apos;s menu can be sold right now.</Empty>
          ) : (
            categories.map(([category, items]) => (
              <section key={category}>
                <h2 className="section-title">{category}</h2>
                <div className="tiles">
                  {items.map((item) => {
                    const inCart =
                      cart.find((line) => line.menuItemId === item.menuItemId)?.quantity ?? 0;
                    const soldOut = item.stockQuantity === 0;
                    return (
                      <button
                        key={item.menuItemId}
                        type="button"
                        className="tile"
                        disabled={soldOut || inCart >= item.stockQuantity}
                        onClick={() =>
                          changeCart({
                            type: 'add',
                            item: {
                              menuItemId: item.menuItemId,
                              name: item.name,
                              unitPriceCents: item.priceCents,
                              maxQuantity: item.stockQuantity,
                            },
                          })
                        }
                      >
                        <span className="tile-name">{item.name}</span>
                        <span className="tile-price">
                          <Money cents={item.priceCents} />
                        </span>
                        <span className={`tile-stock ${soldOut ? 'out' : ''}`}>
                          {soldOut ? 'Sold out' : `${item.stockQuantity - inCart} left`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))
          )}
        </div>
        <aside className="card cart">
          <h2>Current sale</h2>
          {cart.length === 0 ? (
            <Empty>Tap an item to add it.</Empty>
          ) : (
            <ul className="cart-lines">
              {cart.map((line) => (
                <li key={line.menuItemId}>
                  <span className="cart-name">{line.name}</span>
                  <span className="stepper">
                    <button
                      type="button"
                      className="secondary small"
                      aria-label={`One fewer ${line.name}`}
                      onClick={() =>
                        changeCart({
                          type: 'set',
                          menuItemId: line.menuItemId,
                          quantity: line.quantity - 1,
                        })
                      }
                    >
                      −
                    </button>
                    <span>{line.quantity}</span>
                    <button
                      type="button"
                      className="secondary small"
                      aria-label={`One more ${line.name}`}
                      disabled={line.quantity >= line.maxQuantity}
                      onClick={() =>
                        changeCart({
                          type: 'set',
                          menuItemId: line.menuItemId,
                          quantity: line.quantity + 1,
                        })
                      }
                    >
                      +
                    </button>
                  </span>
                  <span className="num">
                    <Money cents={line.unitPriceCents * line.quantity} />
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="cart-total">
            <span>
              Total · {cartItemCount(cart)} item{cartItemCount(cart) === 1 ? '' : 's'}
            </span>
            <strong>
              <Money cents={cartTotalCents(cart)} />
            </strong>
          </div>
          <div className="segmented" role="radiogroup" aria-label="Payment method">
            {PAYMENT_METHODS.map((method) => (
              <button
                key={method.value}
                type="button"
                role="radio"
                aria-checked={payment === method.value}
                className={payment === method.value ? 'active' : 'secondary'}
                onClick={() => setPayment(method.value)}
              >
                {method.label}
              </button>
            ))}
          </div>
          <input
            placeholder="Note (optional)"
            value={note}
            maxLength={300}
            onChange={(e) => setNote(e.target.value)}
          />
          <ErrorBox error={createSale.error} />
          {stockProblem ? (
            <p className="muted">Stock changed since the menu loaded; it has been refreshed.</p>
          ) : null}
          <button
            type="button"
            className="checkout"
            disabled={cart.length === 0 || createSale.isPending}
            onClick={checkout}
          >
            {createSale.isPending ? 'Recording…' : 'Charge'}
          </button>
          {cart.length > 0 ? (
            <button
              type="button"
              className="link-button"
              onClick={() => changeCart({ type: 'clear' })}
            >
              Clear sale
            </button>
          ) : null}
        </aside>
      </div>
      {receipt ? (
        <Modal title="Sale recorded" onClose={() => setReceipt(null)}>
          <Receipt sale={receipt} />
          <div className="form-actions">
            <button type="button" onClick={() => setReceipt(null)}>
              New sale
            </button>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
