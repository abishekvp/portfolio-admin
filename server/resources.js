/**
 * Collection definitions. Each spec drives:
 *  - the table schema (columns are added automatically when new fields appear),
 *  - input validation for the admin API,
 *  - row <-> JSON conversion,
 *  - the public shape returned in the portfolio bundle.
 *
 * Field types: string, text, url, email, enum, bool, int, list (string[]), json, media (media id).
 */

const f = {
  string: (max = 255, o = {}) => ({ type: 'string', max, ...o }),
  text: (max = 10000, o = {}) => ({ type: 'text', max, ...o }),
  url: (o = {}) => ({ type: 'url', max: 1000, ...o }),
  email: (o = {}) => ({ type: 'email', max: 254, ...o }),
  enumOf: (options, o = {}) => ({ type: 'enum', options, default: options[0], ...o }),
  bool: (def = false, o = {}) => ({ type: 'bool', default: def, ...o }),
  int: (min, max, def = 0, o = {}) => ({ type: 'int', min, max, default: def, ...o }),
  list: (o = {}) => ({ type: 'list', default: [], maxItems: 100, ...o }),
  media: (o = {}) => ({ type: 'media', ...o }),
};

export const JOB_TYPES = ['full_time', 'part_time', 'internship', 'freelance', 'contract'];

export const resources = {
  experience: {
    table: 'pm_experience',
    label: 'Experience',
    fields: {
      job_title: f.string(200, { required: true }),
      company: f.string(200, { required: true }),
      company_url: f.url(),
      job_type: f.enumOf(JOB_TYPES),
      location: f.string(150),
      start_date: f.string(50),
      end_date: f.string(50),
      is_current: f.bool(false),
      description: f.text(2000),
      achievements: f.list({ itemMax: 1000 }),
      technologies: f.list({ itemMax: 100 }),
      logo_id: f.media(),
      visible: f.bool(true),
    },
    search: ['job_title', 'company', 'description'],
    orderBy: 'sort_order ASC, id ASC',
  },

  education: {
    table: 'pm_education',
    label: 'Education',
    fields: {
      institution: f.string(255, { required: true }),
      degree: f.string(255, { required: true }),
      field_of_study: f.string(255),
      location: f.string(150),
      start_date: f.string(50),
      end_date: f.string(50),
      grade: f.string(50),
      description: f.text(3000),
      logo_id: f.media(),
      visible: f.bool(true),
    },
    search: ['institution', 'degree', 'field_of_study'],
    orderBy: 'sort_order ASC, id ASC',
  },

  skills: {
    table: 'pm_skills',
    label: 'Skills',
    fields: {
      name: f.string(150, { required: true }),
      category: f.string(100, { required: true, default: 'General' }),
      icon: f.string(100),
      proficiency: f.int(0, 100, 80),
      implemented: f.text(1000),
      learned: f.text(1000),
      visible: f.bool(true),
    },
    search: ['name', 'category'],
    filters: ['category'],
    orderBy: 'sort_order ASC, id ASC',
  },

  projects: {
    table: 'pm_projects',
    label: 'Projects',
    fields: {
      title: f.string(255, { required: true }),
      description: f.text(5000),
      tags: f.list({ itemMax: 60 }),
      demo_url: f.url(),
      github_url: f.url(),
      image_id: f.media(),
      is_featured: f.bool(false),
      visible: f.bool(true),
    },
    search: ['title', 'description'],
    orderBy: 'sort_order ASC, id ASC',
  },

  achievements: {
    table: 'pm_achievements',
    label: 'Achievements',
    fields: {
      title: f.string(255, { required: true }),
      description: f.text(3000),
      icon: f.string(32, { default: '🏆' }),
      issuer: f.string(255),
      date_label: f.string(100),
      link: f.url(),
      image_id: f.media(),
      visible: f.bool(true),
    },
    search: ['title', 'description', 'issuer'],
    orderBy: 'sort_order ASC, id ASC',
  },

  testimonials: {
    table: 'pm_testimonials',
    label: 'Testimonials',
    fields: {
      name: f.string(150, { required: true }),
      role: f.string(150),
      company: f.string(150),
      content: f.text(3000, { required: true }),
      rating: f.int(1, 5, 5),
      photo_id: f.media(),
      photo_url: f.url(),
      email: f.email(),
      status: f.enumOf(['pending', 'approved', 'rejected']),
      is_featured: f.bool(false),
      admin_notes: f.text(2000),
      source: f.enumOf(['admin', 'website'], { readonly: true }),
      ip: f.string(64, { readonly: true }),
      session_id: f.string(64, { readonly: true }),
    },
    search: ['name', 'role', 'company', 'content', 'email'],
    filters: ['status', 'source'],
    orderBy: 'created_at DESC, id DESC',
    publicOrderBy: 'is_featured DESC, sort_order ASC, created_at DESC',
    paginate: true,
  },

  messages: {
    table: 'pm_messages',
    label: 'Messages',
    creatable: false,
    fields: {
      name: f.string(150, { readonly: true }),
      email: f.email({ readonly: true }),
      subject: f.string(255, { readonly: true }),
      phone: f.string(50, { readonly: true }),
      message: f.text(5000, { readonly: true }),
      is_read: f.bool(false),
      is_starred: f.bool(false),
      is_archived: f.bool(false),
      admin_notes: f.text(2000),
      ip: f.string(64, { readonly: true }),
      user_agent: f.string(500, { readonly: true }),
      session_id: f.string(64, { readonly: true }),
    },
    search: ['name', 'email', 'subject', 'message'],
    filters: ['is_read', 'is_starred', 'is_archived'],
    orderBy: 'created_at DESC, id DESC',
    paginate: true,
    affectsPublic: false,
  },
};

export function getResource(name) {
  return Object.prototype.hasOwnProperty.call(resources, name) ? resources[name] : null;
}

export const mediaFieldNames = (spec) =>
  Object.entries(spec.fields)
    .filter(([, def]) => def.type === 'media')
    .map(([name]) => name);
