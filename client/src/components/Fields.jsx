import { useRef, useState } from 'react';
import { ArrowDown, ArrowUp, FileText, ImagePlus, Library, Plus, Trash2, Upload, X } from 'lucide-react';
import { api, formatBytes, uploadMedia } from '../lib/api.js';
import { Button, IconButton, Modal, Spinner, cx, useFetch, useToast } from './ui.jsx';

export function Field({ label, help, error, required, children, span, htmlFor }) {
  return (
    <div className={cx('field', span === 'full' && 'field-full', error && 'has-error')}>
      {label && (
        <label className="field-label" htmlFor={htmlFor}>
          {label}
          {required && <span className="req">*</span>}
        </label>
      )}
      {children}
      {error ? <p className="field-error">{error}</p> : help ? <p className="field-help">{help}</p> : null}
    </div>
  );
}

let uid = 0;
const nextId = () => `f${++uid}`;

/** Render a grid of fields bound to `value`. */
export function FormFields({ fields, value, onChange, errors = {}, pathPrefix = '' }) {
  return (
    <div className="form-grid">
      {fields.map((f) => {
        if (f.showIf && !f.showIf(value)) return null;
        const err = errors[pathPrefix + f.name];
        return (
          <FieldInput
            key={f.name}
            field={f}
            value={value?.[f.name]}
            error={err}
            errors={errors}
            path={pathPrefix + f.name}
            onChange={(v) => onChange(f.name, v)}
          />
        );
      })}
    </div>
  );
}

function FieldInput({ field: f, value, onChange, error, errors, path }) {
  const [id] = useState(nextId);
  const common = { id, placeholder: f.placeholder, 'aria-invalid': !!error };
  let input;
  switch (f.type) {
    case 'textarea':
      input = <textarea {...common} rows={f.rows || 4} value={value ?? ''} maxLength={f.max} onChange={(e) => onChange(e.target.value)} />;
      break;
    case 'number':
      input = <input {...common} type="number" min={f.min} max={f.max} value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))} />;
      break;
    case 'range':
      input = (
        <div className="range-row">
          <input id={id} type="range" min={f.min ?? 0} max={f.max ?? 100} value={value ?? 0} onChange={(e) => onChange(Number(e.target.value))} />
          <span className="range-value">{value ?? 0}%</span>
        </div>
      );
      break;
    case 'select':
      input = (
        <select {...common} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
          {(f.options || []).map((o) => {
            const opt = typeof o === 'string' ? { value: o, label: o } : o;
            return (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            );
          })}
        </select>
      );
      break;
    case 'toggle':
      return (
        <div className={cx('field field-toggle', f.span === 'full' && 'field-full')}>
          <label className="toggle">
            <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
            <span className="toggle-track">
              <span className="toggle-thumb" />
            </span>
            <span className="toggle-label">
              <strong>{f.label}</strong>
              {f.help && <small className="muted">{f.help}</small>}
            </span>
          </label>
        </div>
      );
    case 'tags':
      input = <TagInput value={value || []} onChange={onChange} placeholder={f.placeholder} id={id} />;
      break;
    case 'lines':
      input = <LinesInput value={value || []} onChange={onChange} placeholder={f.placeholder} addLabel={f.addLabel} />;
      break;
    case 'media':
      input = <MediaPicker value={value} onChange={onChange} preset={f.preset} accept={f.accept || 'image'} previewUrl={f.previewUrl} />;
      break;
    case 'repeater':
      input = <Repeater value={value || []} onChange={onChange} fields={f.fields} itemLabel={f.itemLabel} addLabel={f.addLabel} errors={errors} path={path} />;
      break;
    case 'group':
      input = (
        <div className="field-group">
          <FormFields fields={f.fields} value={value || {}} errors={errors} pathPrefix={`${path}.`} onChange={(k, v) => onChange({ ...(value || {}), [k]: v })} />
        </div>
      );
      break;
    default:
      input = (
        <input
          {...common}
          type={f.type === 'email' ? 'email' : f.type === 'url' ? 'text' : 'text'}
          inputMode={f.type === 'url' ? 'url' : undefined}
          value={value ?? ''}
          maxLength={f.max}
          onChange={(e) => onChange(e.target.value)}
          className={f.type === 'icon' ? 'input-icon' : undefined}
        />
      );
  }
  return (
    <Field label={f.label} help={f.help} error={error} required={f.required} span={f.span} htmlFor={id}>
      {input}
    </Field>
  );
}

export function TagInput({ value, onChange, placeholder = 'Type and press Enter', id }) {
  const [draft, setDraft] = useState('');
  const add = (raw) => {
    const parts = raw.split(',').map((s) => s.trim()).filter(Boolean);
    if (!parts.length) return;
    onChange([...value, ...parts.filter((p) => !value.includes(p))]);
    setDraft('');
  };
  return (
    <div className="tag-input">
      {value.map((t, i) => (
        <span key={t + i} className="chip">
          {t}
          <button type="button" aria-label={`Remove ${t}`} onClick={() => onChange(value.filter((_, j) => j !== i))}>
            <X size={12} />
          </button>
        </span>
      ))}
      <input
        id={id}
        value={draft}
        placeholder={value.length ? '' : placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            add(draft);
          } else if (e.key === 'Backspace' && !draft && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={() => add(draft)}
      />
    </div>
  );
}

function move(arr, from, to) {
  const next = [...arr];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function LinesInput({ value, onChange, placeholder, addLabel = 'Add item' }) {
  return (
    <div className="lines-input">
      {value.map((line, i) => (
        <div key={i} className="line-row">
          <span className="line-index">{i + 1}</span>
          <textarea rows={2} value={line} placeholder={placeholder} onChange={(e) => onChange(value.map((v, j) => (j === i ? e.target.value : v)))} />
          <div className="line-actions">
            <IconButton icon={ArrowUp} label="Move up" disabled={i === 0} onClick={() => onChange(move(value, i, i - 1))} />
            <IconButton icon={ArrowDown} label="Move down" disabled={i === value.length - 1} onClick={() => onChange(move(value, i, i + 1))} />
            <IconButton icon={Trash2} label="Remove" variant="danger" onClick={() => onChange(value.filter((_, j) => j !== i))} />
          </div>
        </div>
      ))}
      <Button type="button" size="sm" icon={Plus} onClick={() => onChange([...value, ''])}>
        {addLabel}
      </Button>
    </div>
  );
}

export function Repeater({ value, onChange, fields, itemLabel, addLabel = 'Add item', errors, path }) {
  const blank = Object.fromEntries(fields.map((f) => [f.name, f.type === 'toggle' ? false : f.type === 'media' ? null : '']));
  return (
    <div className="repeater">
      {value.map((item, i) => (
        <div key={i} className="repeater-item">
          <div className="repeater-head">
            <span className="repeater-title">{(itemLabel && itemLabel(item, i)) || `Item ${i + 1}`}</span>
            <div className="line-actions">
              <IconButton icon={ArrowUp} label="Move up" disabled={i === 0} onClick={() => onChange(move(value, i, i - 1))} />
              <IconButton icon={ArrowDown} label="Move down" disabled={i === value.length - 1} onClick={() => onChange(move(value, i, i + 1))} />
              <IconButton icon={Trash2} label="Remove" variant="danger" onClick={() => onChange(value.filter((_, j) => j !== i))} />
            </div>
          </div>
          <FormFields
            fields={fields}
            value={item}
            errors={errors}
            pathPrefix={`${path}[${i}].`}
            onChange={(k, v) => onChange(value.map((it, j) => (j === i ? { ...it, [k]: v } : it)))}
          />
        </div>
      ))}
      <Button type="button" size="sm" icon={Plus} onClick={() => onChange([...value, { ...blank }])}>
        {addLabel}
      </Button>
    </div>
  );
}

// ------------------------------------------------------------------ media

export function MediaPicker({ value, onChange, preset = 'default', accept = 'image', previewUrl }) {
  const toast = useToast();
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [meta, setMeta] = useState(null);

  const url = value ? meta?.id === value ? meta.url : `/api/media/${value}` : previewUrl || '';
  const isImage = accept === 'image';

  async function handleFile(file) {
    if (!file) return;
    setBusy(true);
    try {
      const media = await uploadMedia(file, { preset, accept: isImage ? 'image' : 'document' });
      setMeta(media);
      onChange(media.id);
      toast.success(`Uploaded ${media.filename} (${formatBytes(media.size)})`);
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  return (
    <div
      className={cx('media-picker', dragging && 'is-dragging')}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        handleFile(e.dataTransfer.files?.[0]);
      }}
    >
      <div className={cx('media-preview', !isImage && 'is-doc')}>
        {busy ? (
          <Spinner label="" />
        ) : value && isImage ? (
          <img src={url} alt="" />
        ) : value ? (
          <FileText size={28} />
        ) : (
          <ImagePlus size={24} className="muted" />
        )}
      </div>
      <div className="media-meta">
        <div className="media-name">{value ? meta?.filename || `Media #${value}` : isImage ? 'No image selected' : 'No file selected'}</div>
        <div className="muted small">{isImage ? 'JPG, PNG, WebP or GIF — converted to WebP and stored in the database' : 'PDF document'}</div>
        <div className="media-actions">
          <Button type="button" size="sm" icon={Upload} onClick={() => input.current?.click()} disabled={busy}>
            Upload
          </Button>
          <Button type="button" size="sm" icon={Library} onClick={() => setLibraryOpen(true)}>
            Library
          </Button>
          {value && (
            <>
              {!isImage && (
                <a className="btn btn-ghost btn-sm" href={url} target="_blank" rel="noreferrer">
                  View
                </a>
              )}
              <Button type="button" size="sm" variant="ghost" icon={X} onClick={() => onChange(null)}>
                Remove
              </Button>
            </>
          )}
        </div>
      </div>
      <input ref={input} type="file" hidden accept={isImage ? 'image/*' : 'application/pdf'} onChange={(e) => handleFile(e.target.files?.[0])} />
      <MediaLibraryModal
        open={libraryOpen}
        kind={isImage ? 'image' : 'document'}
        onClose={() => setLibraryOpen(false)}
        onSelect={(m) => {
          setMeta(m);
          onChange(m.id);
          setLibraryOpen(false);
        }}
      />
    </div>
  );
}

export function MediaLibraryModal({ open, onClose, onSelect, kind }) {
  const { data, loading } = useFetch(open ? `/api/admin/media?kind=${kind}` : null, [open]);
  return (
    <Modal open={open} onClose={onClose} title="Choose from library" size="lg">
      {loading ? (
        <Spinner block />
      ) : !data?.items?.length ? (
        <p className="muted">No {kind === 'image' ? 'images' : 'documents'} uploaded yet.</p>
      ) : (
        <div className="media-grid media-grid-select">
          {data.items.map((m) => (
            <button key={m.id} type="button" className="media-tile" onClick={() => onSelect(m)}>
              {m.mime.startsWith('image/') ? <img src={m.url} alt={m.alt || m.filename} loading="lazy" /> : <FileText size={32} />}
              <span className="media-tile-name">{m.filename}</span>
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}

export { api };
