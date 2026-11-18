import {
  changeEnteredLineTotal,
  changeEntryMode,
  changeLineQuantity,
  changePriceEntryMode,
  grossLineAmount,
  netLineAmount,
  receivedBaseQuantity,
  receivedBaseUnitCost,
} from './purchaseLineMath';

const line = {
  qty: 4,
  entryMode: 'loose',
  packSize: 1,
  unitPrice: 250,
  lineDiscount: 0,
  priceEntryMode: 'unit',
  enteredLineTotal: '',
};

test('loose unit pricing calculates the gross and net line amount', () => {
  expect(grossLineAmount(line)).toBe(1000);
  expect(netLineAmount({ ...line, lineDiscount: 100 })).toBe(900);
  expect(receivedBaseQuantity(line)).toBe(4);
});

test('pack entry converts entry quantity into received base units', () => {
  const packLine = { ...line, entryMode: 'pack', packSize: 5, unitPrice: 2500 };
  expect(receivedBaseQuantity(packLine)).toBe(20);
  expect(receivedBaseUnitCost(packLine)).toBe(500);
});

test('total entry keeps the entered total fixed when quantity changes', () => {
  const totalMode = changePriceEntryMode(line, 'total');
  const entered = changeEnteredLineTotal(totalMode, '100');
  const resized = changeLineQuantity(entered, '3');

  expect(resized.enteredLineTotal).toBe('100');
  expect(Number(resized.unitPrice)).toBeCloseTo(33.333333, 6);
  expect(grossLineAmount(resized)).toBeCloseTo(100, 5);
});

test('switching between loose and pack pricing preserves the value per base unit', () => {
  const packLine = changeEntryMode(line, 'pack', 5);
  expect(Number(packLine.unitPrice)).toBe(1250);
  expect(receivedBaseQuantity(packLine)).toBe(20);

  const looseAgain = changeEntryMode(packLine, 'loose', 1);
  expect(Number(looseAgain.unitPrice)).toBe(250);
});
