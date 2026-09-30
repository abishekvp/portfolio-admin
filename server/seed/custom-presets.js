/**
 * Custom content presets: ready-made sets of template keys a portfolio theme reads.
 * Applying a preset only adds keys that do not exist yet (unless `overwrite`), so it is
 * safe to re-apply after editing. Values equal the theme's built-in defaults, so applying a
 * preset changes nothing visible until you edit a value.
 */
import { db } from '../db/index.js';
import { resources } from '../resources.js';
import { HttpError } from '../lib/validate.js';
import { createItem, updateItem } from '../services/collections.js';

const text = (group_key, key, label, value, help = '') => ({ group_key, key, label, type: 'text', value, help });
const area = (group_key, key, label, value, help = '') => ({ group_key, key, label, type: 'textarea', value, help });
const items = (group_key, key, label, schema, value, help = '') => ({ group_key, key, label, type: 'items', schema, value, help });

export const CUSTOM_PRESETS = {
  'abishek-portfolio': {
    label: 'Abishek portfolio (Vue theme)',
    description: 'Hero, About and Contact texts used by the abishek.in theme. Name, headline, summary, photo, resume and contacts come from Profile/Contacts.',
    entries: [
      text('hero', 'badge', 'Status badge', '// SENIOR PLATFORM & SECURITY ENGINEER'),
      text('hero', 'tagline', 'Tagline', 'Backend Architecture • Enterprise Integrations • IdP • DevOps'),
      area('hero', 'description', 'Intro paragraph', 'Senior Software Engineer specializing in high-throughput backend architecture, enterprise DevOps integrations, Identity Provider management, and automated tooling at Securden.'),
      items('hero', 'highlights', 'Highlight cards',
        [{ name: 'icon', label: 'Icon', type: 'text' }, { name: 'value', label: 'Value', type: 'text' }, { name: 'label', label: 'Label', type: 'text' }],
        [
          { icon: '🛡️', value: '4+ Years', label: 'Security Engineering' },
          { icon: '🏆', value: 'SIH Winner', label: 'Smart India Hackathon' },
          { icon: '⚡', value: 'DevOps', label: 'Terraform, Ansible, Jenkins, etc,...' },
        ]),
      text('hero', 'primary_cta_label', 'Primary button label', 'View Architecture & Projects'),
      text('hero', 'resume_label', 'Resume button label', 'Download CV'),
      text('hero', 'portrait_tag', 'Portrait caption', 'Software Engineer at Securden'),
      items('hero', 'floating_badges', 'Floating badges (max 2)',
        [{ name: 'icon', label: 'Icon', type: 'text' }, { name: 'title', label: 'Title', type: 'text' }, { name: 'text', label: 'Text', type: 'text' }],
        [
          { icon: '🛡️', title: 'Security Platform', text: 'PAM, Vault, Password Self-Serv...' },
          { icon: '⚙️', title: 'IDP and DevOps', text: 'AD, Entra ID, Ansible, Jenkins, Ter...' },
        ]),
      text('about', 'role_badge', 'Role badge', 'ROLE: SENIOR_SOFTWARE_ENGINEER'),
      text('about', 'expertise_title', 'Expertise heading', 'Core Expertise'),
      items('about', 'expertise', 'Expertise items',
        [{ name: 'title', label: 'Title', type: 'text' }, { name: 'description', label: 'Description', type: 'textarea' }],
        [
          { title: 'Backend Architecture', description: 'Designing high-throughput, secure, and resilient enterprise applications.' },
          { title: 'Enterprise Integrations', description: 'Seamlessly connecting and integrating extensive DevOps toolchains.' },
          { title: 'Identity Providers', description: 'Implementing and managing Identity Provider (IdP) integrations.' },
          { title: 'Automated Tooling', description: 'Scripting automations and streamlining workflows with Playwright, BeautifulSoup4, and Selenium, alongside DevOps tools such as Ansible, Jenkins, Terraform, Chef, and Puppet.' },
        ]),
      items('about', 'highlights', 'Highlight cards',
        [{ name: 'icon', label: 'Icon', type: 'text' }, { name: 'title', label: 'Title', type: 'text' }, { name: 'description', label: 'Description', type: 'text' }],
        [
          { icon: '🛡️', title: 'Security Engineering', description: 'Platform Integrations & DevOps Integration' },
          { icon: '🏆', title: 'Achievement', description: 'SIH 2022 Winner' },
          { icon: '🎓', title: 'Mentorship', description: 'Peer Mentorship & Jury Member' },
        ]),
      area('contact', 'intro', 'Intro', "If you'd like to collaborate, discuss opportunities, or build robust and secure software solutions — feel free to reach out."),
      area('contact', 'roles', 'Open to roles', "I'm open to roles in Platform Engineering, Security Engineering, Identity provider integrations, DevOps tools integration, and Product Engineering."),
      text('contact', 'form_heading', 'Form heading', 'Send a Direct Transmission'),
      text('contact', 'footer_text', 'Footer text', 'Architected with high-assurance platform standards.'),
    ],
  },
};

export async function applyCustomPreset(id, { overwrite = false } = {}) {
  const preset = CUSTOM_PRESETS[id];
  if (!preset) throw new HttpError(404, 'Unknown preset');
  const spec = resources.custom_content;
  let added = 0;
  let updated = 0;
  for (const entry of preset.entries) {
    const existing = await db.one('SELECT id FROM pm_custom_content WHERE group_key = ? AND key = ?', [entry.group_key, entry.key]);
    if (!existing) {
      await createItem(spec, { ...entry, schema: entry.schema || [], visible: true });
      added++;
    } else if (overwrite) {
      await updateItem(spec, existing.id, { ...entry, schema: entry.schema || [] });
      updated++;
    }
  }
  return { added, updated };
}
