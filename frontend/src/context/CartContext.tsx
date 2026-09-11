import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import type { CartItem, MenuItem } from '../types/menu.ts';

const CART_KEY = 'bonapp_cart';
const TABLE_KEY = 'bonapp_tableId';

interface CartContextValue {
  cartItems: CartItem[];
  tableId: string | null;
  totalCount: number;
  totalPrice: number;
  addItem: (item: MenuItem) => void;
  removeItem: (itemId: string) => void;
}

const CartContext = createContext<CartContextValue | null>(null);

function loadCart(): CartItem[] {
  try {
    const raw = localStorage.getItem(CART_KEY);
    return raw ? (JSON.parse(raw) as CartItem[]) : [];
  } catch {
    return [];
  }
}

interface CartProviderProps {
  children: ReactNode;
  tableId: string | null;
}

export function CartProvider({ children, tableId }: CartProviderProps) {
  const [cartItems, setCartItems] = useState<CartItem[]>(loadCart);

  useEffect(() => {
    if (tableId) localStorage.setItem(TABLE_KEY, tableId);
  }, [tableId]);

  useEffect(() => {
    localStorage.setItem(CART_KEY, JSON.stringify(cartItems));
  }, [cartItems]);

  const totalCount = useMemo(
    () => cartItems.reduce((sum, ci) => sum + ci.quantity, 0),
    [cartItems]
  );

  const totalPrice = useMemo(
    () => cartItems.reduce((sum, ci) => sum + ci.item.price * ci.quantity, 0),
    [cartItems]
  );

  const addItem = useCallback((item: MenuItem) => {
    setCartItems(prev => {
      const existing = prev.find(ci => ci.item.id === item.id);
      if (existing) {
        return prev.map(ci =>
          ci.item.id === item.id ? { ...ci, quantity: ci.quantity + 1 } : ci
        );
      }
      return [...prev, { item, quantity: 1 }];
    });
  }, []);

  const removeItem = useCallback((itemId: string) => {
    setCartItems(prev => {
      const existing = prev.find(ci => ci.item.id === itemId);
      if (!existing) return prev;
      if (existing.quantity === 1) return prev.filter(ci => ci.item.id !== itemId);
      return prev.map(ci =>
        ci.item.id === itemId ? { ...ci, quantity: ci.quantity - 1 } : ci
      );
    });
  }, []);

  const value = useMemo(
    () => ({ cartItems, tableId, totalCount, totalPrice, addItem, removeItem }),
    [cartItems, tableId, totalCount, totalPrice, addItem, removeItem]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside CartProvider');
  return ctx;
}
