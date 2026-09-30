import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Archive, ArchiveRestore, ArrowLeft, Copy, Mail, MailOpen, Reply, Star, Trash2 } from 'lucide-react';
import { api, copyText, formatDate, timeAgo } from '../lib/api.js';
import { Button, Empty, IconButton, PageHeader, SearchInput, Spinner, Tabs, cx, useConfirm, useFetch, useToast } from '../components/ui.jsx';

const FILTERS = {
  inbox: 'is_archived=0',
  unread: 'is_archived=0&is_read=0',
  starred: 'is_starred=1',
  archived: 'is_archived=1',
};

export default function Messages() {
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState(params.get('filter') || 'inbox');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const selectedId = Number(params.get('id')) || null;
  const toast = useToast();
  const confirm = useConfirm();

  const list = useFetch(`/api/admin/c/messages?${FILTERS[filter]}&page=${page}&limit=30${q ? `&q=${encodeURIComponent(q)}` : ''}`);
  const [message, setMessage] = useState(null);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!selectedId) return setMessage(null);
    let cancelled = false;
    api.get(`/api/admin/c/messages/${selectedId}`).then((m) => {
      if (cancelled) return;
      setMessage(m);
      setNotes(m.admin_notes || '');
      list.setData((d) => d && { ...d, items: d.items.map((x) => (x.id === m.id ? { ...x, is_read: true } : x)) });
    }).catch((err) => toast.error(err));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const select = (id) => setParams(id ? { id: String(id) } : {});

  async function patch(m, changes, note) {
    try {
      const updated = await api.patch(`/api/admin/c/messages/${m.id}`, changes);
      if (message?.id === m.id) setMessage(updated);
      list.setData((d) => ({ ...d, items: d.items.map((x) => (x.id === m.id ? { ...x, ...updated } : x)) }));
      if (note) toast.success(note);
      if ('is_archived' in changes) list.reload();
    } catch (err) {
      toast.error(err);
    }
  }

  async function remove(m) {
    const ok = await confirm({ title: 'Delete message?', message: `The message from ${m.name} will be permanently deleted.`, confirmLabel: 'Delete' });
    if (!ok) return;
    try {
      await api.del(`/api/admin/c/messages/${m.id}`);
      select(null);
      list.reload();
      toast.success('Message deleted');
    } catch (err) {
      toast.error(err);
    }
  }

  async function markAllRead() {
    const ids = (list.data?.items || []).filter((m) => !m.is_read).map((m) => m.id);
    if (!ids.length) return;
    await api.post('/api/admin/c/messages/bulk', { ids, action: 'update', patch: { is_read: true } });
    list.reload();
  }

  const items = list.data?.items || [];
  const total = list.data?.total || 0;
  const pages = Math.max(1, Math.ceil(total / 30));
  const replyHref = message
    ? `mailto:${encodeURIComponent(message.email)}?subject=${encodeURIComponent(`Re: ${message.subject || 'Your message'}`)}&body=${encodeURIComponent(`\n\n---\nOn ${formatDate(message.created_at)}, ${message.name} wrote:\n> ${message.message.split('\n').join('\n> ')}`)}`
    : '#';

  return (
    <div className="page page-wide">
      <PageHeader title="Messages" description="Contact form submissions. Each visitor can send one message per day (per email and per IP)." actions={<Button icon={MailOpen} onClick={markAllRead}>Mark page as read</Button>} />
      <div className={cx('inbox', selectedId && 'has-selection')}>
        <div className="inbox-list">
          <div className="inbox-tools">
            <Tabs
              value={filter}
              onChange={(v) => {
                setFilter(v);
                setPage(1);
              }}
              tabs={[
                { value: 'inbox', label: 'Inbox' },
                { value: 'unread', label: 'Unread' },
                { value: 'starred', label: 'Starred' },
                { value: 'archived', label: 'Archived' },
              ]}
            />
            <SearchInput
              value={q}
              onChange={(v) => {
                setQ(v);
                setPage(1);
              }}
              placeholder="Search name, email, text…"
            />
          </div>
          {list.loading && !list.data ? (
            <Spinner block />
          ) : !items.length ? (
            <Empty icon={Mail} title="No messages">Nothing in this view.</Empty>
          ) : (
            <ul className="message-list">
              {items.map((m) => (
                <li key={m.id}>
                  <button className={cx('message-row', !m.is_read && 'is-unread', m.id === selectedId && 'is-active')} onClick={() => select(m.id)}>
                    <span className="message-top">
                      <strong>{m.name}</strong>
                      <span className="muted small">{timeAgo(m.created_at)}</span>
                    </span>
                    <span className="message-subject">{m.subject}</span>
                    <span className="message-preview muted">{m.message}</span>
                    {m.is_starred && <Star size={13} className="featured-star message-star" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {pages > 1 && (
            <div className="pager">
              <Button size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
              <span className="muted small">Page {page} of {pages}</span>
              <Button size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          )}
        </div>

        <div className="inbox-detail">
          {!message ? (
            <Empty icon={Mail} title="Select a message">Choose a message from the list to read it.</Empty>
          ) : (
            <article className="message-view">
              <div className="message-actions">
                <IconButton icon={ArrowLeft} label="Back" className="only-mobile" onClick={() => select(null)} />
                <a className="btn btn-primary btn-sm" href={replyHref}>
                  <Reply size={16} />
                  <span>Reply</span>
                </a>
                <IconButton icon={Star} label={message.is_starred ? 'Unstar' : 'Star'} className={message.is_starred ? 'is-starred' : ''} onClick={() => patch(message, { is_starred: !message.is_starred })} />
                <IconButton icon={message.is_read ? Mail : MailOpen} label={message.is_read ? 'Mark as unread' : 'Mark as read'} onClick={() => patch(message, { is_read: !message.is_read })} />
                <IconButton icon={message.is_archived ? ArchiveRestore : Archive} label={message.is_archived ? 'Move to inbox' : 'Archive'} onClick={() => patch(message, { is_archived: !message.is_archived }, message.is_archived ? 'Moved to inbox' : 'Archived')} />
                <IconButton icon={Trash2} label="Delete" variant="danger" onClick={() => remove(message)} />
              </div>
              <h2>{message.subject}</h2>
              <div className="message-from">
                <div className="avatar">{message.name.slice(0, 1).toUpperCase()}</div>
                <div>
                  <strong>{message.name}</strong>
                  <div className="muted small">
                    {message.email}
                    <IconButton icon={Copy} label="Copy email" size={13} onClick={async () => (await copyText(message.email)) && toast.success('Email copied')} />
                    {message.phone && ` · ${message.phone}`}
                  </div>
                </div>
                <span className="muted small">{formatDate(message.created_at)}</span>
              </div>
              <div className="message-body">{message.message}</div>
              <details className="message-meta">
                <summary>Technical details</summary>
                <dl>
                  <dt>IP</dt><dd>{message.ip || '—'}</dd>
                  <dt>Browser</dt><dd>{message.user_agent || '—'}</dd>
                  <dt>Visitor session</dt><dd>{message.session_id || '—'}</dd>
                </dl>
              </details>
              <div className="field">
                <label className="field-label" htmlFor="notes">Private notes</label>
                <textarea id="notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Only visible to you" />
                {notes !== (message.admin_notes || '') && (
                  <div className="form-footer">
                    <Button size="sm" variant="primary" onClick={() => patch(message, { admin_notes: notes }, 'Notes saved')}>Save notes</Button>
                  </div>
                )}
              </div>
            </article>
          )}
        </div>
      </div>
    </div>
  );
}
