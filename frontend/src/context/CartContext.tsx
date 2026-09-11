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

interface CartContextValue {
  cartItems: CartItem[];
  tableId: string | null;
  totalCount: number;
  totalPrice: number;
  addItem: (item: MenuItem) => void;
  removeItem: (itemId: string) => void;
}

const CartContext = createContext<CartContextValue | null>(null);

interface CartProviderProps {
  children: ReactNode;
  tableId: string | null;
  slug: string;
}

export function CartProvider({ children, tableId, slug }: CartProviderProps) {
  const [cartItems, setCartItems] = useState<CartItem[]>(() => {
    try {
      const raw = localStorage.getItem(`bonapp_cart_${slug}`);
      return raw ? (JSON.parse(raw) as CartItem[]) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    if (tableId) {
      localStorage.setItem(`bonapp_table_${slug}`, tableId);
    } else {
      localStorage.removeItem(`bonapp_table_${slug}`);
    }
  }, [tableId, slug]);

  useEffect(() => {
    localStorage.setItem(`bonapp_cart_${slug}`, JSON.stringify(cartItems));
  }, [cartItems, slug]);

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
