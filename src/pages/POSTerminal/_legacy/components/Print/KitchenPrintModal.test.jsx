import { act, fireEvent, render, screen } from '@testing-library/react';
import { buildKitchenHtml, printKitchenTicket } from '../../utils/kitchenPrinter';
import KitchenPrintModal from './KitchenPrintModal';

vi.mock('../../utils/kitchenPrinter', () => ({
  buildKitchenHtml: vi.fn(() => '<div>Combined KOT</div>'),
  printKitchenTicket: vi.fn(),
}));

test('starts only one kitchen transfer when Send to Kitchen is clicked twice', async () => {
  let finishPrint;
  printKitchenTicket.mockReturnValue(new Promise((resolve) => {
    finishPrint = resolve;
  }));
  const onPrinted = vi.fn();
  const order = { transactionNumber: 'KOT-1', items: [{ name: 'Burger', qty: 1 }] };

  render(
    <KitchenPrintModal
      order={order}
      outletName="Main Outlet"
      onPrinted={onPrinted}
      onCancel={vi.fn()}
    />,
  );

  const sendButton = screen.getByRole('button', { name: /send to kitchen/i });
  fireEvent.click(sendButton);
  fireEvent.click(sendButton);

  expect(buildKitchenHtml).toHaveBeenCalledTimes(1);
  expect(printKitchenTicket).toHaveBeenCalledTimes(1);

  await act(async () => {
    finishPrint({ ok: true, confirmation: 'multi-printer-complete' });
  });
  expect(onPrinted).toHaveBeenCalledTimes(1);
});
