import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import MenuItemTile from './MenuItemTile';

let mockState;

vi.mock('react-redux', () => ({
  useDispatch: () => vi.fn(),
  useSelector: (selector) => selector(mockState),
}));

vi.mock('../../store/slices/cartSlice', () => ({
  addItem: (payload) => ({ type: 'cart/addItem', payload }),
}));

vi.mock('react-hot-toast', () => ({
  __esModule: true,
  default: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

const stateFor = (availability, taxConfig = {}) => ({
  menu: { availability },
  cart: { items: [] },
  order: { resumedItemQtyMap: {}, orderType: 'dine-in' },
  taxConfig: { standardRate: 0, serviceChargeRate: 0, serviceChargeOrderTypes: [], ...taxConfig },
});

afterEach(cleanup);

describe('MenuItemTile stock placement', () => {
  it('shows variation stock inside the size modal and not on the menu card', () => {
    const item = {
      _id: 'drink',
      name: 'Pepsi',
      variations: [
        { _id: 'small', name: 'Pepsi - 345ML', price: 140 },
        { _id: 'large', name: 'Pepsi - 1.5L', price: 240 },
      ],
    };
    mockState = stateFor({
      drink: {
        stock: {},
        variations: {
          small: { available: 108 },
          large: { available: 3 },
        },
      },
    });

    render(<MenuItemTile item={item} />);

    expect(screen.queryByText('108 left')).not.toBeInTheDocument();
    expect(screen.queryByText('3 left')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Pepsi/i }));

    expect(screen.getByText('108 left')).toBeInTheDocument();
    expect(screen.getByText('3 left')).toBeInTheDocument();
  });

  it('keeps stock on the card when the item has no variations', () => {
    const item = { _id: 'bread', name: 'Garlic Bread', price: 350, variations: [] };
    mockState = stateFor({
      bread: {
        stock: {},
        available: 7,
      },
    });

    render(<MenuItemTile item={item} />);

    expect(screen.getByText('7 left')).toBeInTheDocument();
  });

  it('does not show outlet tax when the menu item is marked tax exempt', () => {
    mockState = stateFor({}, { standardRate: 16 });

    render(<MenuItemTile item={{ _id: 'water', name: 'Water', price: 100, taxRate: 0 }} />);

    expect(screen.queryByText('+16% tax')).not.toBeInTheDocument();
  });
});
