import { useEffect, useMemo, useState } from 'react';
import { Copy, Download, ExternalLink, FileDown, Plus, RotateCcw, Save, Trash2 } from 'lucide-react';
import { api, copyText } from '../lib/api.js';
import { Field, MediaPicker } from '../components/Fields.jsx';
import { Button, Card, Empty, IconButton, PageHeader, Spinner, useFetch, useToast } from '../components/ui.jsx';

export const SLUG_RE = /^[a-z0-9][a-z0-9_-]{0,59}$/;
export const toSlug = (s) => String(s || '').toLowerCase().trim().replace(/[^a-z0-9_-]+/g, '-').replace(/^[-_]+/, '').slice(0, 60);

let seq = 0;
const withKey = (l) => ({ ...l, _k: ++seq });
const strip = (links) => links.map(({ _k, ...l }) => l);

/** Public URL of a download link; includes the site's API key so it resolves to this account. */
export function useDownloadBase() {
  const { data } = useFetch('/api/admin/integration');
  const key = data?.keys?.find((k) => k.token)?.token;
  return (slug) => (data ? `${data.base_url}/api/download/${encodeURIComponent(slug)}${key ? `?key=${encodeURIComponent(key)}` : ''}` : '');
}

export default function Downloads() {
  const settings = useFetch('/api/admin/settings/downloads');
  const media = useFetch('/api/admin/media');
  const urlFor = useDownloadBase();
  const toast = useToast();
  const [links, setLinks] = useState(null);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings.data) setLinks(settings.data.links.map(withKey));
  }, [settings.data]);

  const metaById = useMemo(() => new Map((media.data?.items || []).map((m) => [m.id, m])), [media.data]);

  if ((settings.loading && !links) || (media.loading && !media.data)) return <Spinner block />;
  if (settings.error) return <p className="text-danger">{settings.error.message}</p>;
  if (!links) return null;

  const dirty = JSON.stringify(strip(links)) !== JSON.stringify(settings.data.links);
  const update = (i, patch) => setLinks((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const add = (slug = '') => setLinks((ls) => [...ls, withKey({ slug, label: '', media_id: null, filename: '' })]);
  const hasResume = links.some((l) => l.slug === 'resume');

  async function save(e) {
    e?.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      const saved = await api.put('/api/admin/settings/downloads', { links: strip(links) });
      settings.setData(saved);
      toast.success('Download links saved — your site picks them up on next load.');
    } catch (err) {
      setErrors(err.errors || {});
      toast.error(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page page-narrow">
      <PageHeader
        title="Downloads"
        description="Map files from your media library to stable download links such as /api/download/resume. Point your site's buttons at the link once, then swap the file here whenever you like."
        actions={<Button icon={Plus} onClick={() => add()}>Add link</Button>}
      />
      <form onSubmit={save} className="settings-form">
        {!links.length ? (
          <Empty
            icon={FileDown}
            title="No download links yet"
            action={<Button variant="primary" icon={Plus} onClick={() => add('resume')}>Add a resume link</Button>}
          >
            A link named <code>resume</code> also powers <code>/api/resume</code> and your site's resume button.
          </Empty>
        ) : (
          <div className="download-list">
            {links.map((l, i) => {
              const url = SLUG_RE.test(l.slug) ? urlFor(l.slug) : '';
              const err = (k) => errors[`links[${i}].${k}`];
              return (
                <Card key={l._k} className="download-item">
                  <div className="download-head">
                    <span className="download-path mono">/api/download/<strong>{l.slug || '…'}</strong></span>
                    {l.slug === 'resume' && <span className="muted small">also served at /api/resume</span>}
                    <span className="spacer" />
                    {url && l.media_id && (
                      <>
                        <IconButton icon={Copy} label="Copy link" onClick={async () => (await copyText(url)) && toast.success('Link copied')} />
                        <a className="icon-btn icon-btn-ghost" href={url} target="_blank" rel="noreferrer" title="Test download" aria-label="Test download">
                          <ExternalLink size={16} />
                        </a>
                      </>
                    )}
                    <IconButton icon={Trash2} label="Remove link" variant="danger" onClick={() => setLinks((ls) => ls.filter((_, j) => j !== i))} />
                  </div>
                  <div className="form-grid">
                    <Field label="Link name (slug)" required error={err('slug')} help="Lowercase letters, numbers, - and _">
                      <input value={l.slug} placeholder="resume" onChange={(e) => update(i, { slug: toSlug(e.target.value) })} />
                    </Field>
                    <Field label="Button label" help="Optional; your site can show it (data.downloads.<slug>.label)">
                      <input value={l.label} placeholder="Download CV" maxLength={200} onChange={(e) => update(i, { label: e.target.value })} />
                    </Field>
                    <Field label="File" required error={err('media_id')} span="full">
                      <MediaPicker value={l.media_id} accept="any" initialMeta={metaById.get(l.media_id) || null} onChange={(id) => update(i, { media_id: id })} />
                    </Field>
                    <Field label="Download file name" help="Name the visitor's browser saves it as. The file extension is added automatically." span="full">
                      <input value={l.filename} placeholder={metaById.get(l.media_id)?.filename || 'Resume.pdf'} onChange={(e) => update(i, { filename: e.target.value })} />
                    </Field>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
        {links.length > 0 && !hasResume && (
          <Button type="button" size="sm" icon={Download} onClick={() => add('resume')}>Add a resume link</Button>
        )}
        <div className="form-footer sticky-footer">
          {dirty && <span className="muted small">Unsaved changes</span>}
          <Button type="button" icon={RotateCcw} disabled={!dirty || saving} onClick={() => setLinks(settings.data.links.map(withKey))}>Discard</Button>
          <Button type="submit" variant="primary" icon={Save} loading={saving} disabled={!dirty}>Save changes</Button>
        </div>
      </form>
    </div>
  );
}
