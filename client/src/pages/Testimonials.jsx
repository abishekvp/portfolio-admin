import { useState } from 'react';
import { Check, Globe, Pencil, Plus, Star, Trash2, X } from 'lucide-react';
import { api, timeAgo } from '../lib/api.js';
import { testimonialFields } from '../lib/schemas.js';
import { ItemEditor } from '../components/ResourceManager.jsx';
import { Badge, Button, Empty, IconButton, PageHeader, SearchInput, Spinner, Tabs, cx, useConfirm, useFetch, useToast } from '../components/ui.jsx';

const schema = { singular: 'testimonial', title: 'Testimonials' };
const TONE = { pending: 'warning', approved: 'success', rejected: 'danger' };

export default function Testimonials() {
  const [status, setStatus] = useState('pending');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null);
  const [selected, setSelected] = useState([]);
  const toast = useToast();
  const confirm = useConfirm();
  const url = `/api/admin/c/testimonials?limit=200${status !== 'all' ? `&status=${status}` : ''}${q ? `&q=${encodeURIComponent(q)}` : ''}`;
  const { data, loading, reload } = useFetch(url);
  const counts = useFetch('/api/admin/badges', [data]);
  const items = data?.items || [];

  async function setItemStatus(ids, next) {
    try {
      await api.post('/api/admin/c/testimonials/bulk', { ids, action: 'update', patch: { status: next } });
      toast.success(`${ids.length} testimonial${ids.length > 1 ? 's' : ''} ${next}`);
      setSelected([]);
      reload();
    } catch (err) {
      toast.error(err);
    }
  }

  async function remove(ids) {
    const ok = await confirm({ title: `Delete ${ids.length} testimonial${ids.length > 1 ? 's' : ''}?`, message: 'This cannot be undone.', confirmLabel: 'Delete' });
    if (!ok) return;
    try {
      if (ids.length === 1) await api.del(`/api/admin/c/testimonials/${ids[0]}`);
      else await api.post('/api/admin/c/testimonials/bulk', { ids, action: 'delete' });
      setSelected([]);
      reload();
      toast.success('Deleted');
    } catch (err) {
      toast.error(err);
    }
  }

  const toggleSel = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <div className="page">
      <PageHeader
        title="Testimonials"
        description="Review submissions from your portfolio. Only approved testimonials are public."
        actions={<Button variant="primary" icon={Plus} onClick={() => setEditing({ status: 'approved', rating: 5 })}>Add testimonial</Button>}
      />
      <div className="toolbar">
        <Tabs
          value={status}
          onChange={(v) => {
            setStatus(v);
            setSelected([]);
          }}
          tabs={[
            { value: 'pending', label: 'Pending', count: counts.data?.testimonials },
            { value: 'approved', label: 'Approved' },
            { value: 'rejected', label: 'Rejected' },
            { value: 'all', label: 'All' },
          ]}
        />
        <SearchInput value={q} onChange={setQ} placeholder="Search testimonials…" />
      </div>

      {selected.length > 0 && (
        <div className="bulk-bar">
          <span>{selected.length} selected</span>
          <Button size="sm" icon={Check} onClick={() => setItemStatus(selected, 'approved')}>Approve</Button>
          <Button size="sm" icon={X} onClick={() => setItemStatus(selected, 'rejected')}>Reject</Button>
          <Button size="sm" variant="danger" icon={Trash2} onClick={() => remove(selected)}>Delete</Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected([])}>Clear</Button>
        </div>
      )}

      {loading && !data ? (
        <Spinner block />
      ) : !items.length ? (
        <Empty title={status === 'pending' ? 'All caught up' : 'Nothing here'}>
          {status === 'pending' ? 'New testimonials submitted on your portfolio will appear here for review.' : 'No testimonials match this filter.'}
        </Empty>
      ) : (
        <div className="testimonial-grid">
          {items.map((t) => (
            <article key={t.id} className={cx('testimonial-card', selected.includes(t.id) && 'is-selected')}>
              <header>
                <input type="checkbox" aria-label={`Select ${t.name}`} checked={selected.includes(t.id)} onChange={() => toggleSel(t.id)} />
                <div className="avatar">{t.photo_src || t.photo_url ? <img src={t.photo_src || t.photo_url} alt="" /> : t.name.slice(0, 1).toUpperCase()}</div>
                <div className="t-who">
                  <strong>{t.name}</strong>
                  <span className="muted small">{[t.role, t.company].filter(Boolean).join(' · ') || '—'}</span>
                </div>
                <Badge tone={TONE[t.status]}>{t.status}</Badge>
              </header>
              <div className="stars" aria-label={`${t.rating} out of 5`}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star key={n} size={14} className={n <= t.rating ? 'star-on' : 'star-off'} />
                ))}
                {t.is_featured && <Badge tone="accent">Featured</Badge>}
              </div>
              <p className="t-content">{t.content}</p>
              <footer>
                <span className="muted small">
                  {t.source === 'website' && <Globe size={12} />} {t.source === 'website' ? 'Submitted' : 'Added'} {timeAgo(t.created_at)}
                  {t.email && ` · ${t.email}`}
                </span>
                <div className="item-actions">
                  {t.status !== 'approved' && <Button size="sm" variant="primary" icon={Check} onClick={() => setItemStatus([t.id], 'approved')}>Approve</Button>}
                  {t.status === 'pending' && <Button size="sm" icon={X} onClick={() => setItemStatus([t.id], 'rejected')}>Reject</Button>}
                  {t.status === 'approved' && <Button size="sm" icon={X} onClick={() => setItemStatus([t.id], 'pending')}>Unpublish</Button>}
                  <IconButton icon={Pencil} label="Edit" onClick={() => setEditing(t)} />
                  <IconButton icon={Trash2} label="Delete" variant="danger" onClick={() => remove([t.id])} />
                </div>
              </footer>
            </article>
          ))}
        </div>
      )}

      <ItemEditor
        resource="testimonials"
        schema={schema}
        fields={testimonialFields}
        item={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          reload();
        }}
      />
    </div>
  );
}
