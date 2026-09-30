import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, Info, Loader2, Search, X, XCircle } from 'lucide-react';
import { api } from '../lib/api.js';

export const cx = (...c) => c.filter(Boolean).join(' ');

export function Button({ variant = 'secondary', size, icon: Icon, loading, children, className, ...rest }) {
  return (
    <button className={cx('btn', `btn-${variant}`, size && `btn-${size}`, className)} disabled={loading || rest.disabled} {...rest}>
      {loading ? <Loader2 size={16} className="spin" /> : Icon ? <Icon size={16} /> : null}
      {children && <span>{children}</span>}
    </button>
  );
}

export function IconButton({ icon: Icon, label, variant = 'ghost', className, size = 16, ...rest }) {
  return (
    <button className={cx('icon-btn', `icon-btn-${variant}`, className)} title={label} aria-label={label} {...rest}>
      <Icon size={size} />
    </button>
  );
}

export function Spinner({ label = 'Loading…', block }) {
  return (
    <div className={cx('spinner', block && 'spinner-block')} role="status">
      <Loader2 size={18} className="spin" />
      <span>{label}</span>
    </div>
  );
}

export function Card({ title, description, actions, children, className, padded = true }) {
  return (
    <section className={cx('card', className)}>
      {(title || actions) && (
        <header className="card-header">
          <div>
            {title && <h3>{title}</h3>}
            {description && <p className="muted">{description}</p>}
          </div>
          {actions && <div className="card-actions">{actions}</div>}
        </header>
      )}
      <div className={padded ? 'card-body' : undefined}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, description, actions, children }) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {description && <p className="muted">{description}</p>}
        {children}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

export function Badge({ tone = 'neutral', children, dot }) {
  return (
    <span className={cx('badge', `badge-${tone}`)}>
      {dot && <span className="badge-dot" />}
      {children}
    </span>
  );
}

export function Toggle({ checked, onChange, label, disabled, size }) {
  return (
    <label className={cx('toggle', size === 'sm' && 'toggle-sm', disabled && 'is-disabled')}>
      <input type="checkbox" checked={!!checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track">
        <span className="toggle-thumb" />
      </span>
      {label && <span className="toggle-label">{label}</span>}
    </label>
  );
}

export function Empty({ icon: Icon = Info, title, children, action }) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon size={22} />
      </div>
      <h4>{title}</h4>
      {children && <p className="muted">{children}</p>}
      {action}
    </div>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.value} role="tab" aria-selected={value === t.value} className={cx('tab', value === t.value && 'is-active')} onClick={() => onChange(t.value)}>
          {t.label}
          {t.count != null && <span className="tab-count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder = 'Search…' }) {
  return (
    <div className="search-input">
      <Search size={16} />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
      {value && <IconButton icon={X} label="Clear search" onClick={() => onChange('')} />}
    </div>
  );
}

export function Modal({ open, onClose, title, subtitle, children, footer, size = 'md', variant = 'modal' }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    document.body.classList.add('no-scroll');
    const t = setTimeout(() => ref.current?.querySelector('input,textarea,select,button:not(.modal-close)')?.focus(), 30);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('no-scroll');
      clearTimeout(t);
    };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className={cx('overlay', variant === 'drawer' && 'overlay-drawer')} onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div ref={ref} className={cx(variant, `${variant}-${size}`)} role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-header">
          <div>
            <h2>{title}</h2>
            {subtitle && <p className="muted">{subtitle}</p>}
          </div>
          <IconButton icon={X} label="Close" onClick={onClose} className="modal-close" />
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-footer">{footer}</footer>}
      </div>
    </div>,
    document.body
  );
}

// ------------------------------------------------------------------ toasts

const ToastCtx = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((type, message) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, type, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), type === 'error' ? 6000 : 3500);
  }, []);
  const api = useRef(null);
  if (!api.current) api.current = {};
  api.current.success = (m) => push('success', m);
  api.current.error = (m) => push('error', m instanceof Error ? m.message : m);
  api.current.info = (m) => push('info', m);
  const icons = { success: CheckCircle2, error: XCircle, info: Info };
  return (
    <ToastCtx.Provider value={api.current}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => {
          const Icon = icons[t.type];
          return (
            <div key={t.id} className={cx('toast', `toast-${t.type}`)}>
              <Icon size={18} />
              <span>{t.message}</span>
            </div>
          );
        })}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

// ------------------------------------------------------------------ confirm dialog

const ConfirmCtx = createContext(null);

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null);
  const confirm = useCallback(
    (opts) =>
      new Promise((resolve) => {
        setState({ title: 'Are you sure?', confirmLabel: 'Confirm', tone: 'danger', ...opts, resolve });
      }),
    []
  );
  const close = (value) => {
    state?.resolve(value);
    setState(null);
  };
  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <Modal
        open={!!state}
        onClose={() => close(false)}
        title={state?.title}
        size="sm"
        footer={
          <>
            <Button onClick={() => close(false)}>Cancel</Button>
            <Button variant={state?.tone === 'danger' ? 'danger' : 'primary'} onClick={() => close(true)}>
              {state?.confirmLabel}
            </Button>
          </>
        }
      >
        <div className="confirm-body">
          {state?.tone === 'danger' && (
            <div className="confirm-icon">
              <AlertTriangle size={20} />
            </div>
          )}
          <p>{state?.message}</p>
        </div>
      </Modal>
    </ConfirmCtx.Provider>
  );
}

export const useConfirm = () => useContext(ConfirmCtx);

// ------------------------------------------------------------------ data hook

export function useFetch(url, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const load = useCallback(async () => {
    if (!url) return;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await api.get(url);
      setState({ data, loading: false, error: null });
      return data;
    } catch (error) {
      setState((s) => ({ ...s, loading: false, error }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, ...deps]);
  useEffect(() => {
    load();
  }, [load]);
  return { ...state, reload: load, setData: (fn) => setState((s) => ({ ...s, data: typeof fn === 'function' ? fn(s.data) : fn })) };
}
