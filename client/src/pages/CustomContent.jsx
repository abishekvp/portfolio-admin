import { useEffect, useMemo, useState } from 'react';
import { Blocks, Code, Copy, Eye, EyeOff, GripVertical, Layers, Pencil, Plus, RotateCcw, Save, Trash2, Wand2 } from 'lucide-react';
import { api, copyText } from '../lib/api.js';
import { Field, LinesInput, MediaPicker, Repeater } from '../components/Fields.jsx';
import { Badge, Button, Card, Empty, IconButton, Modal, PageHeader, SearchInput, Spinner, Toggle, cx, useConfirm, useFetch, useToast } from '../components/ui.jsx';

export const CUSTOM_TYPES = [
  { value: 'text', label: 'Text', hint: 'A single line' },
  { value: 'textarea', label: 'Long text', hint: 'Paragraphs' },
  { value: 'number', label: 'Number', hint: '' },
  { value: 'boolean', label: 'On / off', hint: 'A switch' },
  { value: 'url', label: 'Link', hint: 'https://, mailto:, #anchor' },
  { value: 'image', label: 'Image', hint: 'Stored in the media library' },
  { value: 'list', label: 'List of text', hint: 'e.g. taglines, bullet points' },
  { value: 'items', label: 'List of items', hint: 'Cards with your own fields' },
  { value: 'json', label: 'JSON (advanced)', hint: 'Any structure' },
];
const FIELD_TYPES = CUSTOM_TYPES.filter((t) => ['text', 'textarea', 'url', 'image', 'number', 'boolean'].includes(t.value));
const typeLabel = (t) => CUSTOM_TYPES.find((x) => x.value === t)?.label || t;
const slugify = (s) => String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^(\d)/, 'k_$1').slice(0, 60);

const emptyValue = (type) => ({ text: '', textarea: '', url: '', number: null, boolean: false, image: null, list: [], items: [], json: null })[type];

/** Maps an item-schema field to the shared form field renderer. */
const toFormField = (f) => ({ name: f.name, label: f.label, type: { image: 'media', boolean: 'toggle', textarea: 'textarea', number: 'number', url: 'url' }[f.type] || 'text', rows: 3 });

export default function CustomContent() {
  const { data, loading, reload, setData } = useFetch('/api/admin/c/custom_content');
  const [group, setGroup] = useState(null);
  const [q, setQ] = useState('');
  const [defining, setDefining] = useState(null);
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [dragId, setDragId] = useState(null);
  const toast = useToast();
  const confirm = useConfirm();

  const items = data?.items || [];
  const groups = useMemo(() => {
    const m = new Map();
    for (const it of items) m.set(it.group_key, (m.get(it.group_key) || 0) + 1);
    return [...m.entries()];
  }, [items]);
  const activeGroup = group && groups.some(([g]) => g === group) ? group : groups[0]?.[0] || null;
  const visibleItems = items.filter(
    (it) => (q ? `${it.group_key} ${it.key} ${it.label}`.toLowerCase().includes(q.toLowerCase()) : it.group_key === activeGroup)
  );

  const replaceItem = (saved) => setData((d) => ({ ...d, items: d.items.map((x) => (x.id === saved.id ? saved : x)) }));

  async function remove(it) {
    const ok = await confirm({ title: 'Delete this field?', message: `“${it.group_key}.${it.key}” will be removed. If your site reads it, the site falls back to its built-in default.`, confirmLabel: 'Delete' });
    if (!ok) return;
    await api.del(`/api/admin/c/custom_content/${it.id}`);
    setData((d) => ({ ...d, items: d.items.filter((x) => x.id !== it.id) }));
    toast.success('Field deleted');
  }

  async function toggleVisible(it) {
    replaceItem(await api.patch(`/api/admin/c/custom_content/${it.id}`, { visible: !it.visible }));
  }

  async function drop(targetId) {
    if (!dragId || dragId === targetId) return;
    const ids = visibleItems.map((i) => i.id);
    ids.splice(ids.indexOf(targetId), 0, ids.splice(ids.indexOf(dragId), 1)[0]);
    setDragId(null);
    const others = items.filter((i) => !ids.includes(i.id)).map((i) => i.id);
    const byId = new Map(items.map((i) => [i.id, i]));
    setData((d) => ({ ...d, items: [...others, ...ids].map((id) => byId.get(id)) }));
    await api.post('/api/admin/c/custom_content/reorder', { ids: [...others, ...ids] });
  }

  return (
    <div className="page page-wide">
      <PageHeader
        title="Custom content"
        description="Template-specific texts, images and lists your portfolio's design can read — hero taglines, highlight cards, badges, anything. The site keeps its own defaults for keys you don't define here."
        actions={
          <>
            <Button icon={Wand2} onClick={() => setPresetsOpen(true)}>Presets</Button>
            <Button variant="primary" icon={Plus} onClick={() => setDefining({ group_key: activeGroup || '', type: 'text', visible: true, schema: [] })}>Add field</Button>
          </>
        }
      />

      {loading && !data ? (
        <Spinner block />
      ) : !items.length ? (
        <Card>
          <Empty
            icon={Blocks}
            title="No custom content yet"
            action={
              <div className="inline-form">
                <Button icon={Wand2} onClick={() => setPresetsOpen(true)}>Start from a preset</Button>
                <Button variant="primary" icon={Plus} onClick={() => setDefining({ group_key: 'hero', type: 'text', visible: true, schema: [] })}>Add a field</Button>
              </div>
            }
          >
            Create groups of fields (e.g. <code>hero</code>, <code>about</code>) and read them on your site as <code>data.custom.hero.tagline</code>.
          </Empty>
        </Card>
      ) : (
        <div className="custom-layout">
          <aside className="custom-groups">
            <SearchInput value={q} onChange={setQ} placeholder="Search all fields…" />
            <div className="group-list">
              {groups.map(([g, n]) => (
                <button key={g} className={cx('group-item', !q && g === activeGroup && 'is-active')} onClick={() => { setQ(''); setGroup(g); }}>
                  <Layers size={15} />
                  <span>{g}</span>
                  <span className="muted small">{n}</span>
                </button>
              ))}
            </div>
            <button className="link-btn small" onClick={() => setDefining({ group_key: '', type: 'text', visible: true, schema: [] })}>+ New group</button>
          </aside>

          <section className="custom-fields">
            {!q && activeGroup && (
              <div className="custom-group-head">
                <h2>{activeGroup}</h2>
                <code className="muted">data.custom.{activeGroup}</code>
              </div>
            )}
            {!visibleItems.length && <Empty title="No matching fields" />}
            {visibleItems.map((it) => (
              <div
                key={it.id}
                className={cx('custom-field', !it.visible && 'is-hidden', dragId === it.id && 'is-dragging')}
                onDragOver={(e) => !q && e.preventDefault()}
                onDrop={() => drop(it.id)}
              >
                <div className="custom-field-head">
                  {!q && (
                    <span draggable onDragStart={() => setDragId(it.id)} onDragEnd={() => setDragId(null)} className="drag-handle" title="Drag to reorder">
                      <GripVertical size={16} />
                    </span>
                  )}
                  <div className="custom-field-title">
                    <strong>{it.label}</strong>
                    <button className="key-chip" title="Copy access path" onClick={async () => (await copyText(`data.custom.${it.group_key}.${it.key}`)) && toast.success('Path copied')}>
                      {it.group_key}.{it.key} <Copy size={11} />
                    </button>
                    <Badge>{typeLabel(it.type)}</Badge>
                    {!it.visible && <Badge tone="warning">Hidden</Badge>}
                  </div>
                  <div className="item-actions">
                    <IconButton icon={it.visible ? Eye : EyeOff} label={it.visible ? 'Hide from site' : 'Show on site'} onClick={() => toggleVisible(it)} />
                    <IconButton icon={Pencil} label="Edit field settings" onClick={() => setDefining(it)} />
                    <IconButton icon={Trash2} label="Delete" variant="danger" onClick={() => remove(it)} />
                  </div>
                </div>
                {it.help && <p className="muted small custom-help">{it.help}</p>}
                <ValueEditor item={it} onSaved={replaceItem} />
              </div>
            ))}
          </section>
        </div>
      )}

      <DefinitionModal
        item={defining}
        groups={groups.map(([g]) => g)}
        onClose={() => setDefining(null)}
        onSaved={(saved) => {
          setDefining(null);
          setGroup(saved.group_key);
          setQ('');
          reload();
        }}
      />
      <PresetsModal open={presetsOpen} onClose={() => setPresetsOpen(false)} onApplied={reload} />
    </div>
  );
}

/** Inline editor for one field's value, typed by the field definition. */
function ValueEditor({ item, onSaved }) {
  const toast = useToast();
  const initial = item.type === 'json' ? JSON.stringify(item.value ?? null, null, 2) : item.value ?? emptyValue(item.type);
  const [value, setValue] = useState(initial);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValue(item.type === 'json' ? JSON.stringify(item.value ?? null, null, 2) : item.value ?? emptyValue(item.type));
    setError('');
  }, [item]);

  const dirty = JSON.stringify(value) !== JSON.stringify(initial);

  async function save() {
    setSaving(true);
    setError('');
    try {
      let v = value;
      if (item.type === 'json') {
        try {
          v = value.trim() ? JSON.parse(value) : null;
        } catch {
          setError('Invalid JSON');
          return;
        }
      }
      const saved = await api.patch(`/api/admin/c/custom_content/${item.id}`, { value: v });
      onSaved(saved);
      toast.success(`${item.label} saved`);
    } catch (err) {
      setError(err.errors?.value || err.message);
    } finally {
      setSaving(false);
    }
  }

  let input;
  switch (item.type) {
    case 'textarea':
      input = <textarea rows={4} value={value} onChange={(e) => setValue(e.target.value)} />;
      break;
    case 'number':
      input = <input type="number" value={value ?? ''} onChange={(e) => setValue(e.target.value === '' ? null : Number(e.target.value))} />;
      break;
    case 'boolean':
      input = <Toggle checked={!!value} onChange={setValue} label={value ? 'On' : 'Off'} />;
      break;
    case 'image':
      input = <MediaPicker value={value} onChange={setValue} />;
      break;
    case 'list':
      input = <LinesInput value={value || []} onChange={setValue} addLabel="Add line" />;
      break;
    case 'items':
      input = (
        <Repeater
          value={value || []}
          onChange={setValue}
          fields={(item.schema || []).map(toFormField)}
          itemLabel={(v) => v[item.schema?.[0]?.name] || v[item.schema?.[1]?.name]}
          addLabel="Add item"
          errors={{}}
          path="value"
        />
      );
      break;
    case 'json':
      input = <textarea className="mono" rows={8} value={value} onChange={(e) => setValue(e.target.value)} spellCheck={false} />;
      break;
    default:
      input = <input value={value ?? ''} onChange={(e) => setValue(e.target.value)} />;
  }

  return (
    <div className="custom-value">
      {input}
      {error && <p className="field-error">{error}</p>}
      {dirty && (
        <div className="form-footer">
          <Button size="sm" icon={RotateCcw} onClick={() => setValue(initial)}>Discard</Button>
          <Button size="sm" variant="primary" icon={Save} loading={saving} onClick={save}>Save</Button>
        </div>
      )}
    </div>
  );
}

/** Create a field or change its definition (group, key, type, item schema). */
function DefinitionModal({ item, groups, onClose, onSaved }) {
  const toast = useToast();
  const [v, setV] = useState(null);
  const [keyEdited, setKeyEdited] = useState(false);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [last, setLast] = useState(null);
  if (item !== last) {
    setLast(item);
    setV(item ? { label: '', key: '', help: '', ...item, schema: item.schema?.length ? item.schema : [] } : null);
    setKeyEdited(Boolean(item?.id));
    setErrors({});
  }
  if (!item || !v) return null;
  const isNew = !item.id;
  const set = (k, val) => setV((s) => ({ ...s, [k]: val }));

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      const body = { group_key: v.group_key, key: v.key || slugify(v.label), label: v.label, type: v.type, help: v.help, schema: v.schema, visible: v.visible ?? true };
      if (isNew) body.value = emptyValue(v.type);
      const saved = isNew ? await api.post('/api/admin/c/custom_content', body) : await api.patch(`/api/admin/c/custom_content/${item.id}`, body);
      toast.success(isNew ? 'Field created' : 'Field updated');
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
      title={isNew ? 'New custom field' : 'Field settings'}
      subtitle="Defines where the value lives and how it is edited. Your site reads it as data.custom.<group>.<key>."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="def-form" loading={saving}>{isNew ? 'Create field' : 'Save settings'}</Button>
        </>
      }
    >
      <form id="def-form" className="form-grid" onSubmit={save}>
        <Field label="Group" required error={errors.group_key} help="Usually the site section, e.g. hero, about, footer.">
          <input list="custom-groups" value={v.group_key} onChange={(e) => set('group_key', slugify(e.target.value) || e.target.value.toLowerCase())} required placeholder="hero" />
          <datalist id="custom-groups">{groups.map((g) => <option key={g} value={g} />)}</datalist>
        </Field>
        <Field label="Label" required>
          <input
            value={v.label}
            onChange={(e) => {
              set('label', e.target.value);
              if (!keyEdited) set('key', slugify(e.target.value));
            }}
            required
            placeholder="Tagline"
          />
        </Field>
        <Field label="Key" required error={errors.key} help={`Access path: data.custom.${v.group_key || 'group'}.${v.key || 'key'}`}>
          <input className="mono" value={v.key} onChange={(e) => { setKeyEdited(true); set('key', slugify(e.target.value)); }} required placeholder="tagline" />
        </Field>
        <Field label="Type" help={CUSTOM_TYPES.find((t) => t.value === v.type)?.hint || ''}>
          <select value={v.type} onChange={(e) => set('type', e.target.value)}>
            {CUSTOM_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </Field>
        {!isNew && v.type !== item.type && (
          <p className="field-full alert alert-danger">Changing the type clears the current value.</p>
        )}
        <Field label="Help text" span="full">
          <input value={v.help} onChange={(e) => set('help', e.target.value)} placeholder="Shown to editors under the field" />
        </Field>
        {v.type === 'items' && (
          <Field label="Item fields" span="full" error={errors.schema} help="Each item in the list has these fields.">
            <SchemaBuilder value={v.schema} onChange={(s) => set('schema', s)} />
          </Field>
        )}
      </form>
    </Modal>
  );
}

function SchemaBuilder({ value, onChange }) {
  const update = (i, patch) => onChange(value.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  return (
    <div className="schema-builder">
      {value.map((f, i) => (
        <div key={i} className="schema-row">
          <input value={f.label} placeholder="Field label" onChange={(e) => update(i, { label: e.target.value, name: f.nameEdited ? f.name : slugify(e.target.value) })} />
          <input className="mono" value={f.name} placeholder="name" onChange={(e) => update(i, { name: slugify(e.target.value), nameEdited: true })} />
          <select value={f.type} onChange={(e) => update(i, { type: e.target.value })}>
            {FIELD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <IconButton icon={Trash2} label="Remove field" variant="danger" onClick={() => onChange(value.filter((_, j) => j !== i))} />
        </div>
      ))}
      <Button type="button" size="sm" icon={Plus} onClick={() => onChange([...value, { label: '', name: '', type: 'text' }])}>Add field</Button>
    </div>
  );
}

function PresetsModal({ open, onClose, onApplied }) {
  const { data } = useFetch(open ? '/api/admin/custom/presets' : null, [open]);
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(null);

  async function apply(p, overwrite) {
    if (overwrite && !(await confirm({ title: 'Reset to preset values?', message: `Every field from “${p.label}” will be reset to its default value. Fields you added yourself are not touched.`, confirmLabel: 'Reset' }))) return;
    setBusy(p.id + overwrite);
    try {
      const r = await api.post(`/api/admin/custom/presets/${p.id}/apply`, { overwrite });
      toast.success(`${r.added} field${r.added === 1 ? '' : 's'} added${overwrite ? `, ${r.updated} reset` : ''}`);
      onApplied();
      onClose();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Presets" subtitle="Ready-made field sets for a portfolio theme. Applying adds only missing fields.">
      {!data ? (
        <Spinner />
      ) : (
        <div className="preset-list">
          {data.items.map((p) => (
            <div key={p.id} className="preset">
              <div>
                <strong>{p.label}</strong>
                <p className="muted small">{p.description}</p>
                <p className="small"><Code size={12} /> {p.groups.join(', ')} · {p.count} fields</p>
              </div>
              <div className="inline-form">
                <Button size="sm" variant="primary" loading={busy === p.id + false} onClick={() => apply(p, false)}>Add missing</Button>
                <Button size="sm" loading={busy === p.id + true} onClick={() => apply(p, true)}>Reset</Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
