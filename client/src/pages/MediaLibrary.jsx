import { useMemo, useRef, useState } from 'react';
import { Copy, ExternalLink, FileDown, FileText, Link2, Trash2, Upload, Wand2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api, copyText, formatBytes, formatDate, uploadMedia } from '../lib/api.js';
import { Badge, Button, Empty, IconButton, Modal, PageHeader, Spinner, Tabs, cx, useConfirm, useFetch, useToast } from '../components/ui.jsx';
import { SLUG_RE, toSlug, useDownloadBase } from './Downloads.jsx';

export default function MediaLibrary() {
  const { data, loading, reload, setData } = useFetch('/api/admin/media');
  const [tab, setTab] = useState('all');
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [detail, setDetail] = useState(null);
  const input = useRef(null);
  const toast = useToast();
  const confirm = useConfirm();

  const items = useMemo(() => {
    const all = data?.items || [];
    if (tab === 'images') return all.filter((m) => m.mime.startsWith('image/'));
    if (tab === 'documents') return all.filter((m) => !m.mime.startsWith('image/'));
    if (tab === 'unused') return all.filter((m) => !m.used_by.length);
    return all;
  }, [data, tab]);

  async function upload(files) {
    if (!files?.length) return;
    setBusy(true);
    let ok = 0;
    for (const file of files) {
      try {
        await uploadMedia(file, { accept: file.type === 'application/pdf' ? 'document' : 'image' });
        ok++;
      } catch (err) {
        toast.error(`${file.name}: ${err.message}`);
      }
    }
    setBusy(false);
    if (input.current) input.current.value = '';
    if (ok) toast.success(`Uploaded ${ok} file${ok > 1 ? 's' : ''}`);
    reload();
  }

  async function remove(m) {
    const inUse = m.used_by.length > 0;
    const ok = await confirm({
      title: 'Delete file?',
      message: inUse ? `This file is used by ${m.used_by.join(', ')}. Deleting it will leave those items without an image.` : `${m.filename} will be permanently deleted.`,
      confirmLabel: inUse ? 'Delete anyway' : 'Delete',
    });
    if (!ok) return;
    try {
      await api.del(`/api/admin/media/${m.id}${inUse ? '?force=1' : ''}`);
      setDetail(null);
      setData((d) => ({ ...d, items: d.items.filter((x) => x.id !== m.id) }));
      toast.success('File deleted');
    } catch (err) {
      toast.error(err);
    }
  }

  async function purge() {
    const ok = await confirm({ title: 'Remove unused files?', message: 'Every file that is not referenced by any content or setting will be deleted.', confirmLabel: 'Remove unused' });
    if (!ok) return;
    const r = await api.post('/api/admin/media/purge-unused');
    toast.success(`Removed ${r.removed} unused file${r.removed === 1 ? '' : 's'}`);
    reload();
  }

  async function saveAlt(m, alt) {
    await api.patch(`/api/admin/media/${m.id}`, { alt });
    setData((d) => ({ ...d, items: d.items.map((x) => (x.id === m.id ? { ...x, alt } : x)) }));
    toast.success('Alt text saved');
  }

  const unusedCount = (data?.items || []).filter((m) => !m.used_by.length).length;

  return (
    <div className="page">
      <PageHeader
        title="Media library"
        description="Images and documents are stored in the database as binary data. Images are converted to WebP, resized and stripped of EXIF/GPS metadata."
        children={data?.storage && <StorageMeter {...data.storage} />}
        actions={
          <>
            <Button icon={Wand2} onClick={purge} disabled={!unusedCount}>Remove unused ({unusedCount})</Button>
            <Button variant="primary" icon={Upload} loading={busy} onClick={() => input.current?.click()}>Upload</Button>
          </>
        }
      />
      <input ref={input} type="file" multiple hidden accept="image/*,application/pdf" onChange={(e) => upload([...e.target.files])} />
      <div
        className={cx('dropzone', dragging && 'is-dragging')}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          upload([...e.dataTransfer.files]);
        }}
        onClick={() => input.current?.click()}
      >
        <Upload size={18} /> Drop images or PDFs here, or click to browse (large photos are resized automatically; max 4 MB after resizing)
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'all', label: 'All' }, { value: 'images', label: 'Images' }, { value: 'documents', label: 'Documents' }, { value: 'unused', label: 'Unused', count: unusedCount }]} />
      {loading && !data ? (
        <Spinner block />
      ) : !items.length ? (
        <Empty title="No files">Upload images for your profile, projects and more.</Empty>
      ) : (
        <div className="media-grid">
          {items.map((m) => (
            <button key={m.id} className="media-tile" onClick={() => setDetail(m)}>
              {m.mime.startsWith('image/') ? <img src={m.url} alt={m.alt || m.filename} loading="lazy" /> : <FileText size={36} />}
              <span className="media-tile-name">{m.filename}</span>
              <span className="media-tile-meta muted">
                {formatBytes(m.size)}
                {!m.used_by.length && <Badge>Unused</Badge>}
              </span>
            </button>
          ))}
        </div>
      )}
      <MediaDetail
        media={detail}
        onClose={() => setDetail(null)}
        onDelete={remove}
        onSaveAlt={saveAlt}
        onLinked={async () => {
          const d = await reload();
          if (d) setDetail((cur) => d.items.find((x) => x.id === cur?.id) || cur);
        }}
        toast={toast}
      />
    </div>
  );
}

function MediaDetail({ media: m, onClose, onDelete, onSaveAlt, onLinked, toast }) {
  const [alt, setAlt] = useState('');
  const [last, setLast] = useState(null);
  if (m !== last) {
    setLast(m);
    setAlt(m?.alt || '');
  }
  if (!m) return null;
  return (
    <Modal
      open
      onClose={onClose}
      title={m.filename}
      size="lg"
      footer={
        <>
          <Button variant="danger" icon={Trash2} onClick={() => onDelete(m)}>Delete</Button>
          <span className="spacer" />
          <a className="btn btn-secondary" href={m.url} target="_blank" rel="noreferrer"><ExternalLink size={16} /><span>Open</span></a>
          <Button icon={Copy} onClick={async () => (await copyText(m.absolute_url)) && toast.success('URL copied')}>Copy URL</Button>
        </>
      }
    >
      <div className="media-detail">
        <div className="media-detail-preview">{m.mime.startsWith('image/') ? <img src={m.url} alt={m.alt} /> : <FileText size={64} />}</div>
        <dl className="kv">
          <dt>Type</dt><dd>{m.mime}</dd>
          <dt>Size</dt><dd>{formatBytes(m.size)}{m.width ? ` · ${m.width}×${m.height}px` : ''}</dd>
          <dt>Uploaded</dt><dd>{formatDate(m.created_at)} {m.source === 'website' && <Badge>from website</Badge>}</dd>
          <dt>Used by</dt><dd>{m.used_by.length ? m.used_by.join(', ') : 'Not used'}</dd>
        </dl>
        <DownloadLinks media={m} onLinked={onLinked} toast={toast} />
        {m.mime.startsWith('image/') && (
          <div className="field">
            <label className="field-label" htmlFor="alt">Alt text</label>
            <div className="inline-form">
              <input id="alt" value={alt} onChange={(e) => setAlt(e.target.value)} placeholder="Describe the image for screen readers" />
              <Button onClick={() => onSaveAlt(m, alt)} disabled={alt === (m.alt || '')}>Save</Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

/** Map this file to a download link (e.g. /api/download/resume) or see which links serve it. */
function DownloadLinks({ media: m, onLinked, toast }) {
  const { data, setData } = useFetch('/api/admin/settings/downloads');
  const urlFor = useDownloadBase();
  const [slug, setSlug] = useState('');
  const [busy, setBusy] = useState(false);
  if (!data) return null;
  const mine = data.links.filter((l) => l.media_id === m.id);
  const target = data.links.find((l) => l.slug === slug);

  async function link(e) {
    e.preventDefault();
    if (!SLUG_RE.test(slug)) return toast.error('Use lowercase letters, numbers, - or _ for the link name');
    setBusy(true);
    try {
      const links = target ? data.links.map((l) => (l.slug === slug ? { ...l, media_id: m.id } : l)) : [...data.links, { slug, label: '', media_id: m.id, filename: '' }];
      setData(await api.put('/api/admin/settings/downloads', { links }));
      toast.success(`/api/download/${slug}${slug === 'resume' ? ' and /api/resume now serve' : ' now serves'} ${m.filename}`);
      setSlug('');
      onLinked?.();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="field">
      <span className="field-label">Download links</span>
      {mine.length > 0 && (
        <ul className="download-mini">
          {mine.map((l) => (
            <li key={l.slug}>
              <FileDown size={14} />
              <span className="mono">/api/download/{l.slug}</span>
              {l.slug === 'resume' && <Badge tone="accent">resume</Badge>}
              <IconButton icon={Copy} label="Copy link" size={13} onClick={async () => (await copyText(urlFor(l.slug))) && toast.success('Link copied')} />
            </li>
          ))}
        </ul>
      )}
      <form className="inline-form" onSubmit={link}>
        <input
          list="download-slugs"
          value={slug}
          placeholder={mine.length ? 'Add another link, e.g. cv' : 'Link name, e.g. resume'}
          onChange={(e) => setSlug(toSlug(e.target.value))}
          aria-label="Download link name"
        />
        <datalist id="download-slugs">
          {data.links.filter((l) => l.media_id !== m.id).map((l) => <option key={l.slug} value={l.slug} />)}
          {!data.links.some((l) => l.slug === 'resume') && <option value="resume" />}
        </datalist>
        <Button type="submit" icon={Link2} loading={busy} disabled={!slug || target?.media_id === m.id}>
          {target ? 'Replace file' : 'Link'}
        </Button>
      </form>
      <p className="field-help">
        {target && target.media_id !== m.id ? `/api/download/${slug} will serve this file instead of its current one.` : 'Choose an existing link to swap its file, or type a new name. '}
        <Link to="/downloads">Manage all downloads</Link>
      </p>
    </div>
  );
}

function StorageMeter({ used, limit }) {
  if (!limit) return <p className="muted small">{formatBytes(used)} used</p>;
  const pct = Math.min(100, Math.round((used / limit) * 100));
  return (
    <div className={cx('storage-meter', pct >= 90 && 'is-full')} style={{ marginTop: 10, maxWidth: 320 }}>
      <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Storage used">
        <div style={{ width: `${pct}%` }} />
      </div>
      <span className="muted small">{formatBytes(used)} of {formatBytes(limit)} used</span>
    </div>
  );
}
