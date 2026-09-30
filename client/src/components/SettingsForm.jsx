import { useEffect, useState } from 'react';
import { RotateCcw, Save } from 'lucide-react';
import { api } from '../lib/api.js';
import { settingsForms } from '../lib/schemas.js';
import { FormFields } from './Fields.jsx';
import { Button, Card, Spinner, useFetch, useToast } from './ui.jsx';

/** Load, edit and save one settings section (`/api/admin/settings/:key`). */
export function SettingsForm({ settingKey, title, description, card = true, onSaved }) {
  const form = settingsForms[settingKey];
  const toast = useToast();
  const { data, loading, error, setData } = useFetch(`/api/admin/settings/${settingKey}`);
  const [value, setValue] = useState(null);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data) setValue(data);
  }, [data]);

  useEffect(() => {
    const dirty = value && data && JSON.stringify(value) !== JSON.stringify(data);
    if (!dirty) return;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [value, data]);

  if (loading && !value) return <Spinner block />;
  if (error) return <p className="text-danger">{error.message}</p>;
  if (!value) return null;

  const dirty = JSON.stringify(value) !== JSON.stringify(data);

  async function save(e) {
    e?.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      const saved = await api.put(`/api/admin/settings/${settingKey}`, value);
      setValue(saved);
      setData(saved);
      toast.success(`${title || form.title} saved — the portfolio will pick it up on next load.`);
      onSaved?.(saved);
    } catch (err) {
      setErrors(err.errors || {});
      toast.error(err);
    } finally {
      setSaving(false);
    }
  }

  const body = (
    <form onSubmit={save} className="settings-form">
      <FormFields fields={form.fields} value={value} errors={errors} onChange={(k, v) => setValue((s) => ({ ...s, [k]: v }))} />
      <div className="form-footer sticky-footer">
        {dirty && <span className="muted small">Unsaved changes</span>}
        <Button type="button" icon={RotateCcw} disabled={!dirty || saving} onClick={() => setValue(data)}>
          Discard
        </Button>
        <Button type="submit" variant="primary" icon={Save} loading={saving} disabled={!dirty}>
          Save changes
        </Button>
      </div>
    </form>
  );

  return card ? (
    <Card title={title ?? form.title} description={description ?? form.description}>
      {body}
    </Card>
  ) : (
    body
  );
}
