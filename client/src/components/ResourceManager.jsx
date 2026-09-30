import { useMemo, useState } from 'react';
import { Copy, Eye, EyeOff, GripVertical, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import { api } from '../lib/api.js';
import { FormFields } from './Fields.jsx';
import { Badge, Button, Empty, IconButton, Modal, PageHeader, SearchInput, Spinner, cx, useConfirm, useFetch, useToast } from './ui.jsx';

/**
 * Generic list + editor for a collection (experience, projects, skills, ...).
 * Supports search, drag-and-drop ordering, visibility toggle, duplicate and delete.
 */
export function ResourceManager({ resource, schema, headerExtra, fieldOverrides }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { data, loading, error, reload, setData } = useFetch(`/api/admin/c/${resource}`);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(null); // item or {} for new
  const [dragId, setDragId] = useState(null);

  const items = data?.items || [];
  const fields = fieldOverrides ? fieldOverrides(schema.fields) : schema.fields;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => JSON.stringify(i).toLowerCase().includes(q));
  }, [items, query]);

  const groups = useMemo(() => {
    if (!schema.groupBy) return [{ key: null, items: filtered }];
    const map = new Map();
    for (const it of filtered) {
      const k = it[schema.groupBy] || 'Other';
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(it);
    }
    return [...map.entries()].map(([key, list]) => ({ key, items: list }));
  }, [filtered, schema.groupBy]);

  async function toggleVisible(item) {
    setData((d) => ({ ...d, items: d.items.map((x) => (x.id === item.id ? { ...x, visible: !x.visible } : x)) }));
    try {
      await api.patch(`/api/admin/c/${resource}/${item.id}`, { visible: !item.visible });
    } catch (err) {
      toast.error(err);
      reload();
    }
  }

  async function remove(item) {
    const ok = await confirm({ title: `Delete this ${schema.singular}?`, message: `“${schema.primary(item)}” will be removed from the portfolio. This cannot be undone.`, confirmLabel: 'Delete' });
    if (!ok) return;
    try {
      await api.del(`/api/admin/c/${resource}/${item.id}`);
      setData((d) => ({ ...d, items: d.items.filter((x) => x.id !== item.id) }));
      toast.success('Deleted');
    } catch (err) {
      toast.error(err);
    }
  }

  async function duplicate(item) {
    try {
      await api.post(`/api/admin/c/${resource}/${item.id}/duplicate`);
      toast.success('Duplicated (hidden until you make it visible)');
      reload();
    } catch (err) {
      toast.error(err);
    }
  }

  async function drop(targetId) {
    if (!dragId || dragId === targetId) return;
    const ids = items.map((i) => i.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    const byId = new Map(items.map((i) => [i.id, i]));
    setData((d) => ({ ...d, items: ids.map((id) => byId.get(id)) }));
    setDragId(null);
    try {
      await api.post(`/api/admin/c/${resource}/reorder`, { ids });
    } catch (err) {
      toast.error(err);
      reload();
    }
  }

  const canDrag = !query;

  return (
    <div className="page">
      <PageHeader
        title={schema.title}
        description={schema.description}
        actions={
          <>
            {headerExtra}
            <Button variant="primary" icon={Plus} onClick={() => setEditing({ ...schema.defaults })}>
              Add {schema.singular}
            </Button>
          </>
        }
      />
      <div className="toolbar">
        <SearchInput value={query} onChange={setQuery} placeholder={`Search ${schema.title.toLowerCase()}…`} />
        <span className="muted small">
          {items.length} item{items.length === 1 ? '' : 's'} · {items.filter((i) => i.visible).length} visible
          {canDrag && items.length > 1 && ' · drag to reorder'}
        </span>
      </div>

      {loading && !data ? (
        <Spinner block />
      ) : error ? (
        <p className="text-danger">{error.message}</p>
      ) : !items.length ? (
        <Empty title={`No ${schema.title.toLowerCase()} yet`} action={<Button variant="primary" icon={Plus} onClick={() => setEditing({ ...schema.defaults })}>Add the first one</Button>}>
          Items you add here appear on the portfolio right away.
        </Empty>
      ) : (
        groups.map((g) => (
          <div key={g.key ?? 'all'} className="item-group">
            {g.key && (
              <h3 className="group-title">
                {g.key} <span className="muted">({g.items.length})</span>
              </h3>
            )}
            <ul className="item-list">
              {g.items.map((item) => (
                <li
                  key={item.id}
                  className={cx('item-row', !item.visible && 'is-hidden', dragId === item.id && 'is-dragging')}
                  draggable={canDrag}
                  onDragStart={(e) => {
                    setDragId(item.id);
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragOver={(e) => canDrag && e.preventDefault()}
                  onDrop={() => drop(item.id)}
                  onDragEnd={() => setDragId(null)}
                >
                  {canDrag && <GripVertical size={16} className="drag-handle" aria-hidden />}
                  {schema.image && (
                    <div className="item-thumb">{item[schema.image] ? <img src={item[schema.image]} alt="" /> : <span>{(schema.primary(item) || '?').replace(/^\W+/, '').slice(0, 1)}</span>}</div>
                  )}
                  <button className="item-main" onClick={() => setEditing(item)}>
                    <span className="item-title">
                      {schema.primary(item)}
                      {item.is_featured && <Star size={14} className="featured-star" aria-label="Featured" />}
                      {item.is_current && <Badge tone="success">Current</Badge>}
                    </span>
                    <span className="item-sub muted">{schema.secondary(item)}</span>
                  </button>
                  <div className="item-actions">
                    {!item.visible && <Badge>Hidden</Badge>}
                    <IconButton icon={item.visible ? Eye : EyeOff} label={item.visible ? 'Hide from portfolio' : 'Show on portfolio'} onClick={() => toggleVisible(item)} />
                    <IconButton icon={Pencil} label="Edit" onClick={() => setEditing(item)} />
                    <IconButton icon={Copy} label="Duplicate" onClick={() => duplicate(item)} />
                    <IconButton icon={Trash2} label="Delete" variant="danger" onClick={() => remove(item)} />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}

      <ItemEditor
        resource={resource}
        schema={schema}
        fields={fields}
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

export function ItemEditor({ resource, schema, fields, item, onClose, onSaved, title }) {
  const toast = useToast();
  const [value, setValue] = useState(null);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [lastItem, setLastItem] = useState(null);

  if (item !== lastItem) {
    setLastItem(item);
    setValue(item ? { ...item } : null);
    setErrors({});
  }

  const isNew = !item?.id;

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      const saved = isNew ? await api.post(`/api/admin/c/${resource}`, value) : await api.patch(`/api/admin/c/${resource}/${item.id}`, value);
      toast.success(isNew ? `${capitalize(schema.singular)} added` : 'Changes saved');
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
      open={!!item}
      onClose={onClose}
      variant="drawer"
      size="lg"
      title={title || (isNew ? `New ${schema.singular}` : `Edit ${schema.singular}`)}
      subtitle={!isNew && item?.updated_at ? `Last updated ${new Date(item.updated_at).toLocaleString()}` : undefined}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="item-editor" loading={saving}>
            {isNew ? `Add ${schema.singular}` : 'Save changes'}
          </Button>
        </>
      }
    >
      {value && (
        <form id="item-editor" onSubmit={save}>
          <FormFields fields={fields} value={value} errors={errors} onChange={(k, v) => setValue((s) => ({ ...s, [k]: v }))} />
        </form>
      )}
    </Modal>
  );
}

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
