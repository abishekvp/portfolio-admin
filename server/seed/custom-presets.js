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
const url = (group_key, key, label, value, help = '') => ({ group_key, key, label, type: 'url', value, help });
const bool = (group_key, key, label, value, help = '') => ({ group_key, key, label, type: 'boolean', value, help });
const items = (group_key, key, label, schema, value, help = '') => ({ group_key, key, label, type: 'items', schema, value, help });

export const CUSTOM_PRESETS = {
  'abishek-portfolio': {
    label: 'Abishek portfolio (Vue theme)',
    description: 'All section titles, badges, highlights, pillars, facts, CTAs and terminal copy used by the abishek.in theme.',
    entries: [
      // Hero section
      text('hero', 'badge', 'Status badge', '// SOFTWARE ENGINEER · PRODUCT BUILDER · MENTOR'),
      text('hero', 'name_first', 'First name', 'Abishek'),
      text('hero', 'name_accent', 'Accent name / initials', 'VP'),
      text('hero', 'tagline', 'Tagline', 'Architecting enterprise security systems, launching live software products, and mentoring builders.'),
      area(
        'hero',
        'description',
        'Intro paragraph',
        'I engineer privileged access, identity, and secrets infrastructure at Securden, design and operate my own live SaaS and web platforms end to end, and mentor developers and student teams from architecture to launch.'
      ),
      items(
        'hero',
        'highlights',
        'Highlight cards',
        [
          { name: 'icon', label: 'Icon', type: 'text' },
          { name: 'value', label: 'Value', type: 'text' },
          { name: 'label', label: 'Label', type: 'text' },
        ],
        [
          { icon: '🚀', value: 'Products & Sites', label: 'Designed, launched & operating' },
          { icon: '🔐', value: 'Enterprise PAM', label: 'Identity, access & CI/CD secrets' },
          { icon: '🧭', value: 'Mentor & Jury', label: 'Guiding devs & hackathons' },
        ]
      ),
      text('hero', 'primary_cta_label', 'Primary button label', 'Explore Launched Products & Sites'),
      url('hero', 'primary_cta_href', 'Primary button link', '#projects'),
      text('hero', 'secondary_cta_label', 'Secondary button label', 'Mentorship & Guided Builds'),
      url('hero', 'secondary_cta_href', 'Secondary button link', '#mentorship'),
      text('hero', 'terminal_label', 'Terminal button label', 'Launch Terminal CLI'),
      text('hero', 'portrait_tag', 'Portrait caption', 'Software Engineer · Builder · Mentor'),
      items(
        'hero',
        'floating_badges',
        'Floating badges (max 2)',
        [
          { name: 'icon', label: 'Icon', type: 'text' },
          { name: 'title', label: 'Title', type: 'text' },
          { name: 'text', label: 'Text', type: 'text' },
        ],
        [
          { icon: '🚀', title: 'Products & Sites', text: 'SaaS · Headless CMS · Client Platforms' },
          { icon: '🧭', title: 'Mentorship & Advisory', text: 'Team Mentor · Speaker · Jury' },
        ]
      ),

      // 01. About / Philosophy & Advisory
      bool('about', 'visible', 'Show Philosophy & Advisory section', true),
      text('about', 'badge', 'Section badge', '// 01. PHILOSOPHY & ADVISORY'),
      text('about', 'section_title', 'Section title (HTML allowed)', 'How I <span class="gradient-text">Build &amp; Lead</span>'),
      text('about', 'section_subtitle', 'Section subtitle', 'Engineering philosophy, product ownership, and technical mentorship'),
      text('about', 'role_badge', 'Narrative role badge', 'SOFTWARE ENGINEER · BUILDER · MENTOR'),
      text('about', 'bio_title', 'Narrative heading', 'Software Engineer · Product Builder · Mentor'),
      text('about', 'expertise_title', 'Pillars box heading', 'Engineering & Advisory Pillars'),
      items(
        'about',
        'expertise',
        'Engineering & Advisory Pillars',
        [
          { name: 'title', label: 'Pillar title', type: 'text' },
          { name: 'description', label: 'Description', type: 'textarea' },
        ],
        [
          {
            title: 'End-to-End Product Ownership',
            description: 'Taking products and web platforms from initial concept to live production—architecture, interface design, deployment, and continuous operation.',
          },
          {
            title: 'Enterprise Identity & Access Architecture',
            description: 'Designing privileged access management, Just-In-Time approval workflows, and multi-directory self-service systems built for enterprise scale.',
          },
          {
            title: 'DevOps & Workflow Automation',
            description: 'Publishing official CI/CD secrets plugins and building automation platforms that eliminate repetitive manual operations.',
          },
          {
            title: 'Developer Mentorship & Project Guidance',
            description: 'Coaching junior engineers, evaluating hackathon prototypes as a jury member, and guiding student and product teams through complex builds.',
          },
        ]
      ),
      items(
        'about',
        'facts',
        'Quick facts under bio',
        [
          { name: 'label', label: 'Label', type: 'text' },
          { name: 'value', label: 'Value', type: 'text' },
        ],
        [
          { label: 'Focus', value: 'Products · Security · Mentorship' },
          { label: 'Shipping Since', value: '2020 — Present' },
          { label: 'Base', value: 'Chennai, India' },
        ]
      ),

      // 02. Launched Products & Sites
      bool('projects', 'visible', 'Show Launched Products & Sites section', true),
      text('projects', 'badge', 'Section badge', '// 02. LAUNCHED PRODUCTS & SITES'),
      text('projects', 'section_title', 'Section title (HTML allowed)', 'Products &amp; Sites <span class="gradient-text">Launched</span>'),
      text('projects', 'section_subtitle', 'Section subtitle', 'Live SaaS platforms, web applications, and client websites I have designed, built, and shipped'),

      // 03. Enterprise Systems & Leadership
      bool('experience', 'visible', 'Show Enterprise Systems & Leadership section', true),
      text('experience', 'badge', 'Section badge', '// 03. ENTERPRISE SYSTEMS & LEADERSHIP'),
      text('experience', 'section_title', 'Section title (HTML allowed)', 'Enterprise Systems &amp; <span class="gradient-text">Leadership</span>'),
      text('experience', 'section_subtitle', 'Section subtitle', 'Mission-critical platforms, commercial launches, and engineering teams I have built with'),

      // 04. Mentorship & Guided Builds
      bool('mentorship', 'visible', 'Show Mentorship & Guided Projects section', true),
      text('mentorship', 'badge', 'Section badge', '// 04. MENTORSHIP & GUIDED BUILDS'),
      text('mentorship', 'section_title', 'Section title (HTML allowed)', 'Mentorship &amp; <span class="gradient-text">Guided Projects</span>'),
      text('mentorship', 'section_subtitle', 'Section subtitle', 'Coaching developers, advising student teams, and leading problem-driven builds from idea to impact'),
      text('mentorship', 'pillars_heading', 'Pillars group heading', 'Mentorship, Coaching & Technical Advisory'),
      text('mentorship', 'guided_heading', 'Guided builds group heading', 'Guided & Flagship Problem-Solving Builds'),

      // 05. Speaking & Jury Events
      bool('events', 'visible', 'Show Talks, Jury & Events section', true),
      text('events', 'badge', 'Section badge', '// 05. SPEAKING & JURY'),
      text('events', 'section_title', 'Section title (HTML allowed)', 'Talks, Jury &amp; <span class="gradient-text">Events</span>'),
      text('events', 'section_subtitle', 'Section subtitle', 'Guest lectures and hackathon jury invitations at engineering institutions'),

      // 06. Endorsements / Testimonials
      bool('testimonials', 'visible', 'Show Endorsements section', true),
      text('testimonials', 'badge', 'Section badge', '// 06. ENDORSEMENTS'),
      text('testimonials', 'section_title', 'Section title (HTML allowed)', 'What People <span class="gradient-text">Say</span>'),
      text('testimonials', 'section_subtitle', 'Section subtitle', 'Colleagues, founders, clients, and mentees I have collaborated with.'),

      // 07. Contact
      bool('contact', 'visible', 'Show Contact section', true),
      text('contact', 'badge', 'Section badge', '// 07. CONNECT'),
      text('contact', 'section_title', 'Section title (HTML allowed)', 'Let&rsquo;s <span class="gradient-text">Connect</span>'),
      text('contact', 'section_subtitle', 'Section subtitle', 'Product collaboration, architecture advisory, mentorship & speaking'),
      area('contact', 'intro', 'Right card heading', 'Launching a product, scaling a platform, or inviting a speaker & mentor?'),
      area(
        'contact',
        'roles',
        'Right card description',
        'Whether you want to talk through product & security architecture, collaborate on a software build, or invite me for a guest lecture, hackathon jury, or mentorship session—I would love to hear from you.'
      ),
      text('contact', 'form_heading', 'Form heading', 'Start a conversation'),
      area('contact', 'form_subheading', 'Form subheading', 'Tell me about what you are building, an upcoming event, or how we can collaborate.'),
      text('contact', 'footer_text', 'Footer text', 'Designed, built, and operated by Abishek VP.'),

      // Interactive Terminal section
      bool('terminal', 'visible', 'Show Interactive Terminal section', true),
      text('terminal', 'badge', 'Section badge', '$ /bin/zsh - interactive CLI'),
      text('terminal', 'section_title', 'Section title (HTML allowed)', 'Developer <span class="gradient-text">Terminal</span>'),
      text('terminal', 'section_subtitle', 'Section subtitle', 'Prefer the command line? Explore my work with a few commands.'),
      text(
        'terminal',
        'welcome_subtitle',
        'Banner subtitle line',
        'Securden • Creator of Portfolio Manager & Family Finance • Engineering Mentor & Speaker.'
      ),
    ],
  },
};

export async function applyCustomPreset(uid, id, { overwrite = false } = {}) {
  const preset = CUSTOM_PRESETS[id];
  if (!preset) throw new HttpError(404, 'Unknown preset');
  const spec = resources.custom_content;
  let added = 0;
  let updated = 0;
  for (const entry of preset.entries) {
    const existing = await db.one('SELECT id FROM pm_custom_content WHERE user_id = ? AND group_key = ? AND key = ?', [uid, entry.group_key, entry.key]);
    if (!existing) {
      await createItem(uid, spec, { ...entry, schema: entry.schema || [], visible: true });
      added++;
    } else if (overwrite) {
      await updateItem(uid, spec, existing.id, { ...entry, schema: entry.schema || [] });
      updated++;
    }
  }
  return { added, updated };
}
