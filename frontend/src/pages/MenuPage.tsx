import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { fetchPublicMenu } from '../api/publicMenu.ts';
import { CartProvider, useCart } from '../context/CartContext.tsx';
import type { MenuItem, PublicMenu } from '../types/menu.ts';

async function placeOrder(tenantId: string, tableId: string, items: Array<{ menuItemId: string; quantity: number }>): Promise<{ orderId: string; status: string }> {
  const res = await fetch('/public/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenantId, tableId, items }),
  });
  if (!res.ok) throw new Error('server_error');
  return res.json() as Promise<{ orderId: string; status: string }>;
}

function SkeletonLoader() {
  return (
    <div data-testid="skeleton-loader" style={{ padding: '1rem' }}>
      <div style={{ background: '#eee', height: '2rem', marginBottom: '1rem', borderRadius: '4px' }} />
      <div style={{ background: '#eee', height: '1rem', marginBottom: '0.5rem', borderRadius: '4px' }} />
      <div style={{ background: '#eee', height: '1rem', borderRadius: '4px' }} />
    </div>
  );
}

interface MenuItemCardProps {
  item: MenuItem;
}

function MenuItemCard({ item }: MenuItemCardProps) {
  const { addItem } = useCart();
  return (
    <div style={{ border: '1px solid #ddd', borderRadius: '8px', padding: '0.75rem', marginBottom: '0.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600 }}>{item.name}</div>
          {item.description && (
            <div style={{ color: '#666', fontSize: '0.875rem' }}>{item.description}</div>
          )}
          <div style={{ marginTop: '0.25rem' }}>{item.price} ₽</div>
        </div>
        <button
          type="button"
          aria-label={`Добавить в корзину: ${item.name}`}
          onClick={() => addItem(item)}
          style={{ marginLeft: '0.75rem', padding: '0.4rem 0.75rem', background: '#333', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
        >
          + в корзину
        </button>
      </div>
    </div>
  );
}

interface CartButtonProps {
  tenantId: string;
  tableId: string | null;
}

function CartButton({ tenantId, tableId }: CartButtonProps) {
  const { totalCount, totalPrice } = useCart();
  const [open, setOpen] = useState(false);

  if (totalCount === 0 && !open) return null;

  return (
    <>
      {totalCount > 0 && (
        <button
          type="button"
          data-testid="cart-button"
          onClick={() => setOpen(o => !o)}
          style={{
            position: 'fixed',
            bottom: '1.5rem',
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#333',
            color: '#fff',
            border: 'none',
            borderRadius: '2rem',
            padding: '0.75rem 1.5rem',
            fontSize: '1rem',
            cursor: 'pointer',
            zIndex: 100,
            display: 'flex',
            gap: '0.75rem',
          }}
        >
          <span>{totalCount}</span>
          <span>Корзина</span>
          <span>{totalPrice.toFixed(2)} ₽</span>
        </button>
      )}
      {open && (
        <CartPanel tenantId={tenantId} tableId={tableId} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

interface OrderConfirmation {
  orderId: string;
}

interface CartPanelProps {
  tenantId: string;
  tableId: string | null;
  onClose: () => void;
}

function CartPanel({ tenantId, tableId, onClose }: CartPanelProps) {
  const { cartItems, addItem, removeItem, totalPrice, clearCart } = useCart();
  const panelRef = useRef<HTMLDivElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<OrderConfirmation | null>(null);

  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  async function handlePlaceOrder() {
    if (!tableId) return;
    setSubmitting(true);
    setOrderError(null);
    try {
      const items = cartItems.map(ci => ({ menuItemId: ci.item.id, quantity: ci.quantity }));
      const result = await placeOrder(tenantId, tableId, items);
      clearCart();
      setConfirmation({ orderId: result.orderId });
    } catch {
      setOrderError('Не удалось отправить заказ. Попробуйте ещё раз.');
    } finally {
      setSubmitting(false);
    }
  }

  if (confirmation) {
    return (
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Корзина"
        tabIndex={-1}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.4)',
          zIndex: 200,
          display: 'flex',
          alignItems: 'flex-end',
        }}
        onKeyDown={e => { if (e.key === 'Escape') onClose(); }}
      >
        <div
          style={{ background: '#fff', width: '100%', borderRadius: '1rem 1rem 0 0', padding: '1.5rem', textAlign: 'center' }}
          onClick={e => e.stopPropagation()}
        >
          <p style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem' }}>Ваш заказ принят!</p>
          <p style={{ color: '#666', marginBottom: '0.5rem' }}>Ожидайте, официант уточнит детали оплаты</p>
          <p style={{ color: '#999', fontSize: '0.875rem', marginBottom: '1.5rem' }}>№ {confirmation.orderId}</p>
          <button
            type="button"
            onClick={onClose}
            style={{ background: '#333', color: '#fff', border: 'none', borderRadius: '0.5rem', padding: '0.75rem 1.5rem', fontSize: '1rem', cursor: 'pointer', width: '100%' }}
          >
            Продолжить заказ
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label="Корзина"
      tabIndex={-1}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        zIndex: 200,
        display: 'flex',
        alignItems: 'flex-end',
      }}
      onClick={onClose}
      onKeyDown={e => { if (e.key === 'Escape') onClose(); }}
    >
      <div
        style={{ background: '#fff', width: '100%', borderRadius: '1rem 1rem 0 0', padding: '1.5rem', maxHeight: '60vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '0 0 1rem' }}>
          <h2 style={{ margin: 0 }}>Корзина</h2>
          <button
            type="button"
            aria-label="Закрыть корзину"
            onClick={onClose}
            style={{ background: 'none', border: 'none', fontSize: '1.25rem', cursor: 'pointer' }}
          >
            ×
          </button>
        </div>
        {cartItems.length === 0 ? (
          <p style={{ color: '#999', textAlign: 'center', margin: '2rem 0' }}>Корзина пуста</p>
        ) : (
          <>
            {cartItems.map(ci => (
              <div key={ci.item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ flex: 1 }}>{ci.item.name}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <button type="button" aria-label={`Уменьшить количество: ${ci.item.name}`} onClick={() => removeItem(ci.item.id)} style={{ padding: '0.25rem 0.5rem' }}>−</button>
                  <span>{ci.quantity}</span>
                  <button type="button" aria-label={`Увеличить количество: ${ci.item.name}`} onClick={() => addItem(ci.item)} style={{ padding: '0.25rem 0.5rem' }}>+</button>
                </div>
                <span style={{ marginLeft: '0.5rem' }}>{ci.item.price * ci.quantity} ₽</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, margin: '1rem 0 0.5rem', borderTop: '1px solid #eee', paddingTop: '0.75rem' }}>
              <span>Итого</span>
              <span>{totalPrice.toFixed(2)} ₽</span>
            </div>
            {orderError && (
              <p role="alert" style={{ color: '#c00', margin: '0.5rem 0' }}>{orderError}</p>
            )}
            <button
              type="button"
              aria-label="Оформить заказ"
              disabled={submitting}
              onClick={handlePlaceOrder}
              style={{ width: '100%', marginTop: '0.75rem', padding: '0.75rem', background: submitting ? '#999' : '#333', color: '#fff', border: 'none', borderRadius: '0.5rem', fontSize: '1rem', cursor: submitting ? 'default' : 'pointer' }}
            >
              {submitting ? '...' : 'Оформить заказ'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

interface MenuContentProps {
  menu: PublicMenu;
  tableId: string | null;
}

function MenuContent({ menu, tableId }: MenuContentProps) {
  return (
    <CartProvider tableId={tableId} slug={menu.slug}>
      <header style={{
        position: 'sticky',
        top: 0,
        background: '#fff',
        zIndex: 50,
        padding: '0.75rem 1rem',
        borderBottom: '1px solid #eee',
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
      }}>
        <div style={{ fontWeight: 700, fontSize: '1.125rem' }}>{menu.name}</div>
        {tableId && <div style={{ color: '#666', fontSize: '0.875rem' }}>Стол {tableId}</div>}
      </header>

      <main style={{ padding: '1rem', paddingBottom: '6rem' }}>
        {menu.categories
          .filter(category => category.items.some(item => item.isAvailable))
          .map(category => (
            <section key={category.id} style={{ marginBottom: '1.5rem' }}>
              <h2 style={{ margin: '0 0 0.75rem', fontSize: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#444' }}>
                {category.name}
              </h2>
              {category.items
                .filter(item => item.isAvailable)
                .map(item => (
                  <MenuItemCard key={item.id} item={item} />
                ))}
            </section>
          ))}
      </main>

      <CartButton tenantId={menu.tenantId} tableId={tableId} />
    </CartProvider>
  );
}

export default function MenuPage() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const tableId = searchParams.get('table');

  const [menu, setMenu] = useState<PublicMenu | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    setMenu(null);
    setError(null);
    const controller = new AbortController();
    fetchPublicMenu(slug, controller.signal)
      .then(data => {
        setMenu(data);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === 'AbortError') return;
        const msg = e instanceof Error && e.message === 'not_found'
          ? 'Заведение не найдено'
          : 'Сервис временно недоступен. Попробуйте позже.';
        setError(msg);
        setLoading(false);
      });
    return () => controller.abort();
  }, [slug]);

  if (loading) return <SkeletonLoader />;
  if (error !== null || !menu) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#c00' }}>
        {error ?? 'Заведение не найдено'}
      </div>
    );
  }

  return <MenuContent menu={menu} tableId={tableId} />;
}
