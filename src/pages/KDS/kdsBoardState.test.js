import { describe, expect, it } from 'vitest';
import { reconcileKdsOrders, removeKdsOrder, shouldRemoveKdsOrder } from './kdsBoardState';

describe('KDS board state', () => {
  it('removes a dispatched order as soon as checkout links the paid sale', () => {
    const current = [{ _id: 'kds-1', currentStatus: 'dispatched', finalSaleTransaction: null }];
    const checkedOut = { _id: 'kds-1', currentStatus: 'dispatched', finalSaleTransaction: 'sale-1' };

    expect(shouldRemoveKdsOrder(checkedOut)).toBe(true);
    expect(reconcileKdsOrders(current, checkedOut)).toEqual([]);
  });

  it('keeps a paid order visible while the kitchen is still preparing it', () => {
    const preparing = { _id: 'kds-1', currentStatus: 'preparing', finalSaleTransaction: 'sale-1' };
    expect(shouldRemoveKdsOrder(preparing)).toBe(false);
    expect(reconcileKdsOrders([], preparing)).toEqual([preparing]);
  });

  it('removes cancelled orders and supports checkout payloads using id', () => {
    const current = [{ _id: 'kds-1' }, { _id: 'kds-2' }];
    expect(reconcileKdsOrders(current, { _id: 'kds-1', currentStatus: 'cancelled' }))
      .toEqual([{ _id: 'kds-2' }]);
    expect(removeKdsOrder(current, { id: 'kds-2' })).toEqual([{ _id: 'kds-1' }]);
  });
});
