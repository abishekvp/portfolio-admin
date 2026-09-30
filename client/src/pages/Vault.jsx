import { useState } from 'react';
import { Copy, Download, Eye, EyeOff, KeyRound, Lock, Paperclip, Pencil, Plus, Trash2 } from 'lucide-react';
import { api, copyText, formatDate, request } from '../lib/api.js';
import { Field, Repeater } from '../components/Fields.jsx';
import { Badge, Button, Card, Empty, IconButton, Modal, PageHeader, SearchInput, Spinner, useConfirm, useFetch, useToast } from '../components/ui.jsx';

export default function Vault() {
  const [q, setQ] = useState('');
  const { data, loading, reload } = useFetch(`/api/admin/vault${q ? `?q=${encodeURIComponent(q)}` : ''}`);
  const [viewing, setViewing] = useState(null);
  const [editing, setEditing] = useState(null);
  const toast = useToast();
  const confirm = useConfirm();

  if (loading && !data) return <Spinner block />;

  if (data && !data.enabled) {
    return (
      <div className="page page-narrow">
        <PageHeader title="Vault" />
        <Card>
          <Empty icon={Lock} title="The vault is locked">
            Set a <code>VAULT_KEY</code> environment variable on the server (32+ random characters, e.g. from
            <code> node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"</code>) and restart. Entries are encrypted with AES-256-GCM using this key — keep it safe; without it
            stored entries cannot be decrypted.
          </Empty>
        </Card>
      </div>
    );
  }

  async function open(item) {
    try {
      setViewing(await api.get(`/api/admin/vault/${item.id}`));
    } catch (err) {
      toast.error(err);
    }
  }

  async function remove(item) {
    const ok = await confirm({ title: 'Delete vault entry?', message: `“${item.title}” and its attachment will be permanently deleted.`, confirmLabel: 'Delete' });
    if (!ok) return;
    await api.del(`/api/admin/vault/${item.id}`);
    setViewing(null);
    reload();
    toast.success('Deleted');
  }

  return (
    <div className="page">
      <PageHeader
        title="Vault"
        description="Private, encrypted notes, credentials and documents. Never exposed to the portfolio."
        actions={<Button variant="primary" icon={Plus} onClick={() => setEditing({ category: 'Credential', fields: [] })}>New entry</Button>}
      />
      <div className="toolbar">
        <SearchInput value={q} onChange={setQ} placeholder="Search titles…" />
      </div>
      {!data?.items?.length ? (
        <Empty icon={KeyRound} title="Your vault is empty">Store credentials, API keys and private documents — everything is encrypted at rest.</Empty>
      ) : (
        <ul className="item-list">
          {data.items.map((it) => (
            <li key={it.id} className="item-row">
              <div className="item-thumb"><KeyRound size={16} /></div>
              <button className="item-main" onClick={() => open(it)}>
                <span className="item-title">
                  {it.title} {it.has_attachment && <Paperclip size={13} className="muted" />}
                </span>
                <span className="item-sub muted">{it.category} · updated {formatDate(it.updated_at)}</span>
              </button>
              <div className="item-actions">
                <IconButton icon={Eye} label="Open" onClick={() => open(it)} />
                <IconButton icon={Trash2} label="Delete" variant="danger" onClick={() => remove(it)} />
              </div>
            </li>
          ))}
        </ul>
      )}
      <VaultView item={viewing} onClose={() => setViewing(null)} onEdit={(it) => { setViewing(null); setEditing(it); }} onDelete={remove} toast={toast} />
      <VaultEditor item={editing} categories={data?.categories || []} onClose={() => setEditing(null)} onSaved={(saved) => { setEditing(null); reload(); setViewing(saved); }} />
    </div>
  );
}

function Secret({ label, value, secret, toast }) {
  const [show, setShow] = useState(!secret);
  if (!value) return null;
  return (
    <div className="secret-row">
      <span className="secret-label muted small">{label}</span>
      <code className="secret-value">{show ? value : '•'.repeat(Math.min(16, value.length))}</code>
      {secret && <IconButton icon={show ? EyeOff : Eye} label={show ? 'Hide' : 'Reveal'} onClick={() => setShow(!show)} />}
      <IconButton icon={Copy} label={`Copy ${label}`} onClick={async () => (await copyText(value)) && toast.success(`${label} copied`)} />
    </div>
  );
}

function VaultView({ item, onClose, onEdit, onDelete, toast }) {
  if (!item) return null;
  return (
    <Modal
      open
      onClose={onClose}
      title={item.title}
      subtitle={`${item.category} · updated ${formatDate(item.updated_at)}`}
      footer={
        <>
          <Button variant="danger" icon={Trash2} onClick={() => onDelete(item)}>Delete</Button>
          <span className="spacer" />
          <Button variant="primary" icon={Pencil} onClick={() => onEdit(item)}>Edit</Button>
        </>
      }
    >
      <div className="secret-list">
        {item.url && <Secret label="URL" value={item.url} toast={toast} />}
        <Secret label="Username" value={item.username} toast={toast} />
        <Secret label="Password" value={item.password} secret toast={toast} />
        {item.fields?.map((f, i) => <Secret key={i} label={f.key || 'Field'} value={f.value} secret toast={toast} />)}
      </div>
      {item.notes && <div className="vault-notes">{item.notes}</div>}
      {item.has_attachment && (
        <a className="btn btn-secondary" href={`/api/admin/vault/${item.id}/attachment`}>
          <Download size={16} />
          <span>{item.attachment_name}</span>
        </a>
      )}
    </Modal>
  );
}

function VaultEditor({ item, categories, onClose, onSaved }) {
  const toast = useToast();
  const [value, setValue] = useState(null);
  const [file, setFile] = useState(null);
  const [last, setLast] = useState(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  if (item !== last) {
    setLast(item);
    setValue(item ? { username: '', password: '', notes: '', url: '', title: '', ...item } : null);
    setFile(null);
    setErrors({});
  }
  if (!item || !value) return null;
  const set = (k) => (e) => setValue((v) => ({ ...v, [k]: e.target.value }));

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('payload', JSON.stringify(value));
      if (file) fd.append('attachment', file);
      const saved = await request(item.id ? 'PUT' : 'POST', item.id ? `/api/admin/vault/${item.id}` : '/api/admin/vault', fd);
      toast.success('Saved securely');
      onSaved(saved);
    } catch (err) {
      setErrors(err.errors || {});
      toast.error(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      variant="drawer"
      size="lg"
      title={item.id ? 'Edit entry' : 'New vault entry'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="vault-form" loading={saving}>Save</Button>
        </>
      }
    >
      <form id="vault-form" onSubmit={save} className="form-grid">
        <Field label="Title" required error={errors.title}>
          <input value={value.title} onChange={set('title')} required />
        </Field>
        <Field label="Category">
          <select value={value.category} onChange={set('category')}>
            {categories.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="URL" span="full">
          <input value={value.url} onChange={set('url')} placeholder="https://" />
        </Field>
        <Field label="Username">
          <input value={value.username} onChange={set('username')} autoComplete="off" />
        </Field>
        <Field label="Password">
          <input type="password" value={value.password} onChange={set('password')} autoComplete="new-password" />
        </Field>
        <Field label="Custom fields" span="full">
          <Repeater
            value={value.fields || []}
            onChange={(fields) => setValue((v) => ({ ...v, fields }))}
            fields={[{ name: 'key', label: 'Name' }, { name: 'value', label: 'Value' }]}
            itemLabel={(f) => f.key}
            addLabel="Add field"
            errors={{}}
            path="fields"
          />
        </Field>
        <Field label="Notes" span="full">
          <textarea rows={5} value={value.notes} onChange={set('notes')} />
        </Field>
        <Field label="Attachment" span="full" help="Any file up to 15 MB — encrypted before it is stored.">
          <div className="inline-form">
            <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            {item.has_attachment && !file && (
              <label className="check-inline">
                <input type="checkbox" checked={!!value.remove_attachment} onChange={(e) => setValue((v) => ({ ...v, remove_attachment: e.target.checked }))} />
                Remove {item.attachment_name} <Badge>current</Badge>
              </label>
            )}
          </div>
        </Field>
      </form>
    </Modal>
  );
}
