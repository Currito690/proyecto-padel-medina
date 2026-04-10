import { createContext, useContext, useState, useEffect } from 'react';

const CartContext = createContext();
const STORAGE_KEY = 'padelmedina_cart';

export const CartProvider = ({ children }) => {
  const [items, setItems] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {}
  }, [items]);

  const buildKey = (item) => `${item.courtId}-${item.date}-${item.timeSlot}`;

  const addItem = (item) => {
    setItems((prev) => {
      const key = buildKey(item);
      if (prev.some((i) => i.cartId === key)) return prev;
      return [...prev, { ...item, cartId: key }];
    });
  };

  const removeItem = (cartId) => {
    setItems((prev) => prev.filter((i) => i.cartId !== cartId));
  };

  const clearCart = () => setItems([]);

  const total = items.reduce((sum, i) => sum + (Number(i.price) || 0), 0);

  return (
    <CartContext.Provider value={{ items, addItem, removeItem, clearCart, total, count: items.length }}>
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
};
