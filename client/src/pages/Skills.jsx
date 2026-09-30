import { useState } from 'react';
import { Tags } from 'lucide-react';
import { collections } from '../lib/schemas.js';
import { ResourceManager } from '../components/ResourceManager.jsx';
import { Button, Modal, useFetch } from '../components/ui.jsx';
import { FormFields } from '../components/Fields.jsx';
import { api } from '../lib/api.js';
import { useToast } from '../components/ui.jsx';

export default function Skills() {
  const { data: meta, setData, reload } = useFetch('/api/admin/settings/skills_meta');
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState([]);
  const [saving, setSaving] = useState(false);
  const [version, setVersion] = useState(0);
  const toast = useToast();

  const categories = (meta?.categories || []).map((c) => c.name).filter(Boolean);

  async function save() {
    setSaving(true);
    try {
      const saved = await api.put('/api/admin/settings/skills_meta', { categories: draft });
      setData(saved);
      setOpen(false);
      setVersion((v) => v + 1);
      toast.success('Categories saved');
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <ResourceManager
        key={version}
        resource="skills"
        schema={collections.skills}
        headerExtra={
          <Button
            icon={Tags}
            onClick={() => {
              reload();
              setDraft(meta?.categories || []);
              setOpen(true);
            }}
          >
            Categories
          </Button>
        }
        fieldOverrides={(fields) =>
          fields.map((f) =>
            f.name === 'category'
              ? categories.length
                ? { ...f, options: [{ value: '', label: 'Choose a category…' }, ...categories] }
                : { ...f, type: 'text', help: 'Tip: define categories (with icons and order) using the Categories button.' }
              : f
          )
        }
      />
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Skill categories"
        subtitle="Order and icons for skill groups on the portfolio."
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" loading={saving} onClick={save}>Save categories</Button>
          </>
        }
      >
        <FormFields
          fields={[
            {
              name: 'categories', label: 'Categories', type: 'repeater', span: 'full', addLabel: 'Add category', itemLabel: (i) => `${i.icon || ''} ${i.name || 'New category'}`,
              fields: [{ name: 'icon', label: 'Icon', type: 'icon', placeholder: '⚙️' }, { name: 'name', label: 'Name' }],
            },
          ]}
          value={{ categories: draft }}
          onChange={(_, v) => setDraft(v)}
        />
      </Modal>
    </>
  );
}
