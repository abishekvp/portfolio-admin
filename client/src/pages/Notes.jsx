import { useMemo, useState } from 'react';
import { Pin, PinOff, Plus, StickyNote, Trash2 } from 'lucide-react';
import { api, timeAgo } from '../lib/api.js';
import { TagInput } from '../components/Fields.jsx';
import { Button, Empty, IconButton, Modal, PageHeader, SearchInput, Spinner, cx, useConfirm, useFetch, useToast } from '../components/ui.jsx';

const COLORS = ['default', 'yellow', 'green', 'blue', 'purple', 'red'];

export default function Notes() {
  const { data, loading, reload, setData } = useFetch('/api/admin/c/notes');
  const [q, setQ] = useState('');
  const [tag, setTag] = useState('');
  const [editing, setEditing] = useState(null);
  const toast = useToast();
  const confirm = useConfirm();

  const notes = data?.items || [];
  const tags = useMemo(() => [...new Set(notes.flatMap((n) => n.tags))].sort(), [notes]);
  const filtered = notes.filter(
    (n) => (!tag || n.tags.includes(tag)) && (!q || `${n.title} ${n.body} ${n.tags.join(' ')}`.toLowerCase().includes(q.toLowerCase()))
  );

  async function togglePin(n) {
    await api.patch(`/api/admin/c/notes/${n.id}`, { is_pinned: !n.is_pinned });
    reload();
  }

  async function remove(n) {
    if (!(await confirm({ title: 'Delete note?', message: `“${n.title}” will be permanently deleted.`, confirmLabel: 'Delete' }))) return;
    await api.del(`/api/admin/c/notes/${n.id}`);
    setData((d) => ({ ...d, items: d.items.filter((x) => x.id !== n.id) }));
    setEditing(null);
    toast.success('Note deleted');
  }

  return (
    <div className="page">
      <PageHeader
        title="Notes"
        description="Private notes for yourself — ideas, drafts, to-dos. Never shown on the portfolio."
        actions={<Button variant="primary" icon={Plus} onClick={() => setEditing({ title: '', body: '', tags: [], color: 'default', is_pinned: false })}>New note</Button>}
      />
      <div className="toolbar">
        <SearchInput value={q} onChange={setQ} placeholder="Search notes…" />
        {tags.length > 0 && (
          <div className="filter-row">
            <button className={cx('chip-btn', !tag && 'is-active')} onClick={() => setTag('')}>All</button>
            {tags.map((t) => (
              <button key={t} className={cx('chip-btn', tag === t && 'is-active')} onClick={() => setTag(tag === t ? '' : t)}>#{t}</button>
            ))}
          </div>
        )}
      </div>
      {loading && !data ? (
        <Spinner block />
      ) : !filtered.length ? (
        <Empty icon={StickyNote} title={notes.length ? 'No matching notes' : 'No notes yet'}>Jot down anything you want to remember.</Empty>
      ) : (
        <div className="notes-grid">
          {filtered.map((n) => (
            <article key={n.id} className={cx('note-card', `note-${n.color}`)} onClick={() => setEditing(n)}>
              <header>
                <h3>{n.title}</h3>
                <IconButton
                  icon={n.is_pinned ? PinOff : Pin}
                  label={n.is_pinned ? 'Unpin' : 'Pin'}
                  className={n.is_pinned ? 'is-pinned' : ''}
                  onClick={(e) => {
                    e.stopPropagation();
                    togglePin(n);
                  }}
                />
              </header>
              <p className="note-body">{n.body}</p>
              <footer>
                <span className="note-tags">{n.tags.map((t) => `#${t}`).join(' ')}</span>
                <span className="muted small">{timeAgo(n.updated_at)}</span>
              </footer>
            </article>
          ))}
        </div>
      )}
      <NoteEditor note={editing} onClose={() => setEditing(null)} onDelete={remove} onSaved={() => { setEditing(null); reload(); }} />
    </div>
  );
}

function NoteEditor({ note, onClose, onSaved, onDelete }) {
  const toast = useToast();
  const [value, setValue] = useState(null);
  const [last, setLast] = useState(null);
  const [saving, setSaving] = useState(false);
  if (note !== last) {
    setLast(note);
    setValue(note ? { ...note } : null);
  }
  if (!note || !value) return null;
  const set = (k, v) => setValue((s) => ({ ...s, [k]: v }));

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    try {
      if (note.id) await api.patch(`/api/admin/c/notes/${note.id}`, value);
      else await api.post('/api/admin/c/notes', value);
      toast.success('Note saved');
      onSaved();
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={note.id ? 'Edit note' : 'New note'}
      size="lg"
      footer={
        <>
          {note.id && <Button variant="danger" icon={Trash2} onClick={() => onDelete(note)}>Delete</Button>}
          <span className="spacer" />
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="note-form" loading={saving}>Save</Button>
        </>
      }
    >
      <form id="note-form" onSubmit={save} className="note-form">
        <input className="note-title-input" value={value.title} onChange={(e) => set('title', e.target.value)} placeholder="Title" required maxLength={200} />
        <textarea rows={12} value={value.body} onChange={(e) => set('body', e.target.value)} placeholder="Write your note…" />
        <TagInput value={value.tags} onChange={(v) => set('tags', v)} placeholder="Add tags" />
        <div className="note-options">
          <div className="color-picker" role="radiogroup" aria-label="Color">
            {COLORS.map((c) => (
              <button key={c} type="button" role="radio" aria-checked={value.color === c} aria-label={c} className={cx('swatch', `note-${c}`, value.color === c && 'is-active')} onClick={() => set('color', c)} />
            ))}
          </div>
          <label className="check-inline">
            <input type="checkbox" checked={value.is_pinned} onChange={(e) => set('is_pinned', e.target.checked)} /> Pin to top
          </label>
        </div>
      </form>
    </Modal>
  );
}
