import { fireEvent, render, screen } from '@testing-library/react';
import { TxnRow, discountRateFor, serviceChargeRateFor } from './ReportDrillDrawer';

test('renders service-charge and discount percentages in transaction drawers', () => {
  const tx = {
    transactionNumber: 'TXN-TEST-1',
    status: 'completed',
    orderType: 'dine-in',
    paymentMethod: 'cash',
    subtotal: 200,
    serviceChargeAmount: 12,
    discountAmount: 20,
    discountMode: 'percent',
    discountPercent: 10,
    totalAmount: 224,
    items: [{ name: 'Crispy', qty: 1, unitPrice: 200, lineTotal: 200, serviceChargeRate: 6 }],
  };

  render(<TxnRow tx={tx} tz="Asia/Karachi" />);
  fireEvent.click(screen.getByRole('button', { name: /TXN-TEST-1/i }));

  expect(screen.getByText('Service Charge (6%)')).toBeInTheDocument();
  expect(screen.getByText('Discount (10%)')).toBeInTheDocument();
});

test('calculates a legacy service-charge rate but does not invent a discount rate', () => {
  expect(serviceChargeRateFor({ subtotal: 200, serviceChargeAmount: 12, items: [] })).toBe(6);
  expect(discountRateFor({ subtotal: 200, discountAmount: 20, discountMode: 'amount' })).toBe(0);
});

