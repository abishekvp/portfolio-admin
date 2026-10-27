// Initial content synchronized with portfolio final copy (abishek.in)

export const settings = {
  profile: {
    full_name: 'Abishek V',
    headline: 'Software Engineer · Backend & Security',
    summary: [
      "I'm a backend engineer working where security meets infrastructure. At Securden I build parts of a privileged access management product that enterprises rely on: password self-service, directory sync, Just-In-Time access APIs, and plugins that keep secrets out of CI/CD pipelines.",
      "During my Computer Science degree at Rajalakshmi Institute of Technology (2020–2024), I worked part-time on websites and client projects at ROOK, Madras Defence Academy and DAAT, and my team won Smart India Hackathon 2022.",
      "Outside work I build two small live apps, Portfolio Manager and Family Finance, to practise designing systems end to end. I've also trained 600+ students in web development and Git, and given a guest lecture on concurrency.",
    ].join('\n\n'),
    location: 'Chennai, India',
    availability: 'Open to backend and security engineering roles',
    email: 'contact@abishek.in',
    phone: '',
    resume_filename: 'Abishek_V_Software_Engineer.pdf',
  },
  skills_meta: {
    categories: [
      { name: 'Strong', icon: '⚡' },
      { name: 'Languages (also used)', icon: '💻' },
      { name: 'Backend & data', icon: '⚙️' },
      { name: 'Identity', icon: '🛡️' },
      { name: 'DevOps & secrets', icon: '🔧' },
      { name: 'Frontend', icon: '🎨' },
      { name: 'Automation', icon: '🤖' },
    ],
  },
  seo: {
    site_title: 'Abishek V – Software Engineer, Backend & Security',
    description:
      'Software Engineer at Securden building identity, privileged access and CI/CD secrets tooling with Python, Django and PostgreSQL.',
    keywords:
      'Abishek V, Software Engineer, Backend Engineer, Identity and Access Management, PAM, Self-Service Password Reset, Terraform provider, Python, Django, PostgreSQL',
    author: 'Abishek V',
  },
};

export const contacts = [
  { type: 'email', label: 'Email', value: 'contact@abishek.in', link: 'mailto:contact@abishek.in', icon: '📧' },
  { type: 'linkedin', label: 'LinkedIn', value: 'linkedin.com/in/abishek-v-p', link: 'https://www.linkedin.com/in/abishek-v-p/', icon: '💼' },
  { type: 'github', label: 'GitHub', value: 'github.com/abishekvp', link: 'https://github.com/abishekvp', icon: '💻' },
];

export const experience = [
  {
    job_title: 'Software Engineer',
    company: 'Securden',
    company_url: 'https://www.securden.com',
    role_tag: 'FULL-TIME · MAR 2024 – PRESENT',
    job_type: 'full_time',
    location: 'Chennai, India',
    start_date: 'Mar 2024',
    end_date: 'Present',
    is_current: true,
    description: 'Privileged Access Management · Identity · DevOps secrets',
    achievements: [
      'Built a Self-Service Password Reset (SSPR) platform from scratch, supporting Active Directory, Microsoft Entra ID and Google Workspace, so users reset their own passwords without a helpdesk ticket.',
      'Added delta sync for Microsoft Entra ID, fetching only changed users and groups instead of the whole directory on every sync.',
      'Built REST APIs to configure Just-In-Time (JIT) privileged access in Securden\'s Password Vault.',
      'Built secrets plugins for Terraform (Go), Chef (Ruby), Puppet, Jenkins (Java) and Ansible, so CI/CD pipelines fetch credentials from Securden at run time instead of storing them in plain text. 3,900+ public downloads.',
      'Redesigned the browser extension\'s UI, added passkey login, and wrote an in-house release script to minify the extension, removing a dependency on an external minification service.',
    ],
    technologies: ['Python', 'Django', 'PostgreSQL', 'Go', 'Ruby', 'Java', 'Terraform', 'Puppet', 'Chef', 'Jenkins', 'Ansible'],
  },
  {
    job_title: 'Software Engineer',
    company: 'DAAT',
    company_url: 'https://daat.group',
    role_tag: 'PART-TIME · MAY 2022 – FEB 2024',
    job_type: 'part_time',
    location: 'Chennai, India',
    start_date: 'May 2022',
    end_date: 'Feb 2024',
    is_current: false,
    description: 'Web Engineering · Client Applications · Internal Tooling',
    achievements: [
      'Rebuilt DAAT\'s brand website and modernised its UI.',
      'Built and delivered client web projects from requirements to production.',
      'Built an internal project management tool on my own for task tracking and team collaboration.',
    ],
    technologies: ['Python', 'Django', 'PostgreSQL', 'REST APIs', 'JavaScript'],
  },
  {
    job_title: 'Web Developer Intern',
    company: 'Madras Defence Academy',
    company_url: '',
    role_tag: 'INTERN · NOV 2021 – JAN 2022',
    job_type: 'internship',
    location: 'Chennai, India',
    start_date: 'Nov 2021',
    end_date: 'Jan 2022',
    is_current: false,
    description: 'EdTech Learning Portal',
    achievements: [
      'Built the academy\'s learning portal in React, covering student onboarding, study material distribution and a student discussion forum.',
    ],
    technologies: ['React', 'JavaScript', 'HTML', 'CSS'],
  },
  {
    job_title: 'Web Developer',
    company: 'ROOK',
    company_url: 'https://rookhq.com',
    role_tag: 'PART-TIME · AUG 2021 – MAY 2022',
    job_type: 'part_time',
    location: 'Chennai, India',
    start_date: 'Aug 2021',
    end_date: 'May 2022',
    is_current: false,
    description: 'Web Development · Client Sites',
    achievements: [
      'Built and launched websites for ROOK and its clients using Python, Django, JavaScript and SQL.',
      'Rebuilt older brand site interfaces for better usability and load speed.',
    ],
    technologies: ['Python', 'Django', 'JavaScript', 'SQL'],
  },
];

export const education = [
  {
    institution: 'Rajalakshmi Institute of Technology',
    degree: 'B.E.',
    field_of_study: 'Computer Science and Engineering',
    location: 'Chennai, India',
    start_date: '2020',
    end_date: '2024',
    grade: 'CGPA: 8.43',
    description: '',
  },
];

const skill = (name, category, extra = {}) => ({ name, category, ...extra });
export const skills = [
  skill('Python', 'Strong'),
  skill('Django', 'Strong'),
  skill('PostgreSQL', 'Strong'),
  skill('Go', 'Languages (also used)'),
  skill('Java', 'Languages (also used)'),
  skill('Ruby', 'Languages (also used)'),
  skill('JavaScript', 'Languages (also used)'),
  skill('C', 'Languages (also used)'),
  skill('C++', 'Languages (also used)'),
  skill('REST API design', 'Backend & data'),
  skill('Node.js', 'Backend & data'),
  skill('MongoDB', 'Backend & data'),
  skill('SQL', 'Backend & data'),
  skill('Active Directory', 'Identity'),
  skill('Microsoft Entra ID', 'Identity'),
  skill('Google Workspace', 'Identity'),
  skill('Just-In-Time access', 'Identity'),
  skill('Terraform provider', 'DevOps & secrets'),
  skill('Jenkins', 'DevOps & secrets'),
  skill('Ansible', 'DevOps & secrets'),
  skill('Chef and Puppet plugin development', 'DevOps & secrets'),
  skill('Git', 'DevOps & secrets'),
  skill('React', 'Frontend'),
  skill('Ember', 'Frontend'),
  skill('HTML', 'Frontend'),
  skill('CSS', 'Frontend'),
  skill('Selenium', 'Automation'),
  skill('Playwright', 'Automation'),
  skill('BeautifulSoup', 'Automation'),
];

export const projects = [
  {
    category: 'Featured Projects',
    kind: 'Live SaaS Platform',
    status: 'Live',
    is_live: true,
    title: 'Portfolio Manager',
    tagline: 'Multi-account headless CMS with publishable API key & lightweight SDK',
    description:
      'Multi-account headless CMS: each account manages its profile, content collections, media, visitor analytics and contact inbox, and connects to any frontend through a publishable API key and a small SDK. This website runs on it.',
    technologies: ['Node.js', 'React'],
    project_url: 'https://admin.abishek.in',
    github_url: 'https://github.com/abishekvp/portfolio-admin',
    link_label: 'admin.abishek.in',
    is_featured: true,
  },
  {
    category: 'Featured Projects',
    kind: 'Live Web & Mobile App',
    status: 'Live',
    is_live: true,
    title: 'Family Finance',
    tagline: 'Shared & private ledgers with role-based access, budgets and category insights',
    description:
      'Shared household ledgers alongside private personal accounts, with Admin / Member / Viewer roles, budgets and category insights. Installable as a PWA.',
    technologies: ['Node.js', 'React'],
    project_url: 'https://finance.abishek.in',
    github_url: 'https://github.com/abishekvp/family-finance',
    link_label: 'finance.abishek.in',
    is_featured: true,
  },
  {
    category: 'Featured Projects',
    kind: 'Academic · SIH 2022 winner',
    status: 'Academic',
    is_live: false,
    title: 'GrantBase',
    tagline: 'National research grant intelligence platform',
    description:
      'Collects research grant calls from several government portals, matches them to a researcher\'s field and sends deadline alerts.',
    technologies: ['Django', 'BeautifulSoup'],
    github_url: 'https://github.com/abishekvp/SIH_DR715',
    link_label: 'GitHub',
    is_featured: true,
  },
  {
    category: 'Featured Projects',
    kind: 'Academic',
    status: 'Academic',
    is_live: false,
    title: 'OASIS records automation',
    tagline: 'Zero-touch academic records ingestion',
    description:
      'Reads student records from Excel, validates them and fills the college\'s OASIS portal automatically, replacing manual data entry.',
    technologies: ['Django', 'Selenium', 'BeautifulSoup', 'Pandas'],
    github_url: 'https://github.com/abishekvp/Web-Automation-Streamlining-OASIS-Web-Portal',
    link_label: 'GitHub',
    is_featured: true,
  },
  {
    category: 'Featured Projects',
    kind: 'Academic',
    status: 'Academic',
    is_live: false,
    title: 'LegalTech',
    tagline: 'Case-record management & advocate search',
    description:
      'Case-record management for lawyers, plus advocate search for clients based on past case history.',
    technologies: ['Django', 'Selenium', 'SQL'],
    github_url: 'https://github.com/abishekvp/legaltech',
    link_label: 'GitHub',
    is_featured: true,
  },
];

export const events = [
  {
    role: 'Guest Lecture',
    title: 'Multithreading & Collections: Building Scalable Concurrent Enterprise Systems',
    host: 'Department of CSE (AI & ML) with Tekhne Club',
    venue: 'Vel Tech High Tech Dr. Rangarajan Dr. Sakunthala Engineering College',
    place: 'Avadi, Chennai',
    date: '26 Sep 2026',
    description:
      'Guest lecture to 40 students on multithreading and concurrent collections in enterprise systems: thread pools, lock contention, race conditions, deadlock prevention, and choosing concurrent data structures.',
    _image_file: 'veltech-guest-lecture-2026.jpeg',
  },
  {
    role: 'Jury Member',
    title: 'Internal Hackathon 2026',
    venue: 'Rajalakshmi Institute of Technology',
    place: 'Chennai',
    date: '2026',
    description:
      'Jury member evaluating student engineering prototypes and system architecture.',
  },
  {
    role: 'Jury Member',
    title: 'Internal Hackathon 2024',
    venue: 'St. Joseph College of Engineering',
    place: 'Chennai',
    date: '26 Feb 2024',
    description:
      'Jury member reviewing technical pitches and providing architectural feedback.',
  },
  {
    role: 'National Winner',
    title: 'Smart India Hackathon 2022 (Software Edition)',
    venue: 'Ministry of Education & AICTE, Government of India',
    place: 'National',
    date: '2022',
    description:
      'National winner for GrantBase — an automated platform collecting research grant calls across government portals with domain matching and deadline alerts.',
  },
  {
    role: 'Peer Trainer',
    title: 'Web Engineering & Git Peer Training',
    venue: 'Rajalakshmi Institute of Technology',
    place: 'Chennai',
    date: '2020 – 2024',
    description:
      'Peer trainer: taught 600+ students web development, Git/GitHub, and deploying live production sites.',
  },
];
