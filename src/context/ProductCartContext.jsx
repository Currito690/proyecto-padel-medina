import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';

// Carrito de la TIENDA de productos. Separado del CartContext de reservas de
// pista (que caduca a los 5 min y no tiene cantidades). Este:
//   · soporta cantidad y variantes (talla/color)
//   · persiste en localStorage SIN caducidad
//   · respeta el stock máximo por variante
// Cada item: { key, productId, variantId, slug, nombre, varianteDesc,
//              precioCentimos, imagen, stock, cantidad }

const STORAGE_KEY = 'padelmedina_shop_cart';
const ProductCartContext = createContext(null);

const buildKey = (productId, variantId) => `${productId}:${variantId || '-'}`;

export function ProductCartProvider({ children }) {
  const [items, setItems] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter(i => i && i.productId) : [];
    } catch { return []; }
  });

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch { /* quota */ }
  }, [items]);

  const addItem = useCallback((item, qty = 1) => {
    const key = buildKey(item.productId, item.variantId);
    setItems(prev => {
      const existing = prev.find(i => i.key === key);
      const max = item.stock ?? Infinity;
      if (existing) {
        const next = Math.min(max, existing.cantidad + qty);
        return prev.map(i => (i.key === key ? { ...i, ...item, key, cantidad: next } : i));
      }
      return [...prev, { ...item, key, cantidad: Math.min(max, Math.max(1, qty)) }];
    });
  }, []);

  const setQty = useCallback((key, qty) => {
    setItems(prev => prev.flatMap(i => {
      if (i.key !== key) return [i];
      const max = i.stock ?? Infinity;
      const n = Math.min(max, Math.max(0, qty));
      return n <= 0 ? [] : [{ ...i, cantidad: n }];
    }));
  }, []);

  const removeItem = useCallback((key) => setItems(prev => prev.filter(i => i.key !== key)), []);
  const clear = useCallback(() => setItems([]), []);

  const count = useMemo(() => items.reduce((s, i) => s + i.cantidad, 0), [items]);
  const subtotalCentimos = useMemo(
    () => items.reduce((s, i) => s + (i.precioCentimos || 0) * i.cantidad, 0),
    [items]
  );

  const value = useMemo(
    () => ({ items, addItem, setQty, removeItem, clear, count, subtotalCentimos }),
    [items, addItem, setQty, removeItem, clear, count, subtotalCentimos]
  );

  return <ProductCartContext.Provider value={value}>{children}</ProductCartContext.Provider>;
}

export function useProductCart() {
  const ctx = useContext(ProductCartContext);
  if (!ctx) throw new Error('useProductCart debe usarse dentro de ProductCartProvider');
  return ctx;
}
