import { createContext, useContext, useState, useEffect } from 'react';

const CartContext = createContext();
const STORAGE_KEY = 'padelmedina_cart';
// Tiempo máximo que una pista puede estar reservada en el carrito sin pagar.
export const CART_EXPIRY_MS = 5 * 60 * 1000;

const isExpired = (item, now) => {
  if (!item.addedAt) return false;
  return now - item.addedAt >= CART_EXPIRY_MS;
};

export const CartProvider = ({ children }) => {
  const [items, setItems] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const parsed = stored ? JSON.parse(stored) : [];
      const now = Date.now();
      // Saneo a la carga: si una pista ya estaba caducada o no tiene addedAt,
      // o se descarta o se le pone timestamp ahora (legacy).
      return parsed
        .map(i => i.addedAt ? i : { ...i, addedAt: now })
        .filter(i => !isExpired(i, now));
    } catch {
      return [];
    }
  });
  // Tick para forzar re-render de countdowns y purgar caducados cada segundo.
  const [, setTick] = useState(0);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {}
  }, [items]);

  // Purgador automático: cada segundo elimina items caducados.
  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      setItems(prev => {
        const fresh = prev.filter(i => !isExpired(i, now));
        return fresh.length === prev.length ? prev : fresh;
      });
      setTick(t => (t + 1) % 1000);
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const buildKey = (item) => `${item.courtId}-${item.date}-${item.timeSlot}`;

  const addItem = (item) => {
    setItems((prev) => {
      const key = buildKey(item);
      if (prev.some((i) => i.cartId === key)) return prev;
      return [...prev, { ...item, cartId: key, addedAt: Date.now() }];
    });
  };

  const removeItem = (cartId) => {
    setItems((prev) => prev.filter((i) => i.cartId !== cartId));
  };

  const clearCart = () => setItems([]);

  const total = items.reduce((sum, i) => sum + (Number(i.price) || 0), 0);

  // ms restantes antes de que el item expire (mín 0).
  const getRemainingMs = (item) => {
    if (!item?.addedAt) return CART_EXPIRY_MS;
    return Math.max(0, item.addedAt + CART_EXPIRY_MS - Date.now());
  };

  return (
    <CartContext.Provider value={{ items, addItem, removeItem, clearCart, total, count: items.length, getRemainingMs }}>
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
};
