import { render, screen } from '@testing-library/react';
import { CancelledOrderDrawer } from './CancelledOrders';

test('renders service-charge and discount percentages for a cancelled order', () => {
  render(
    <CancelledOrderDrawer
      onClose={vi.fn()}
      order={{
        transactionNumber: 'TXN-CANCELLED-1',
        businessDate: '2026-08-05',
        subtotal: 200,
        taxAmount: 32,
        effectiveTaxRate: 16,
        serviceChargeAmount: 12,
        discountAmount: 20,
        discountMode: 'percent',
        discountPercent: 10,
        totalAmount: 224,
        items: [{ name: 'Crispy', qty: 1, unitPrice: 200, lineTotal: 200, serviceChargeRate: 6 }],
      }}
    />,
  );

  expect(screen.getByText('Service Charge (6%)')).toBeInTheDocument();
  expect(screen.getByText('Discount (10%)')).toBeInTheDocument();
});

