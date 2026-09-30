// Initial content, taken from the existing portfolio site (abishek/src/data/portfolio.json
// and the hard-coded Hero / Achievements sections) so the admin starts fully populated.

export const settings = {
  profile: {
    full_name: 'Abishek VP',
    headline: 'Software Engineer',
    email: 'contact@abishek.in',
    phone: '+91 72002 63991',
    location: 'India',
    availability: 'Open to Platform & Security Engineering roles',
    resume_filename: 'Abishek_VP_Resume.pdf',
    website_url: 'https://abishek.in',
    github_url: 'https://github.com/abishekvp',
    linkedin_url: 'https://linkedin.com/in/abishek-v-p',
    custom_links: [{ label: 'Instagram', url: 'https://instagram.com/abiraj.vp06' }],
  },
  hero: {
    badge: '// SENIOR PLATFORM & SECURITY ENGINEER',
    name: 'Abishek',
    name_accent: 'VP',
    tagline: 'Backend Architecture • Enterprise Integrations • IdP • DevOps',
    description:
      'Senior Software Engineer specializing in high-throughput backend architecture, enterprise DevOps integrations, Identity Provider management, and automated tooling at Securden.',
    highlights: [
      { icon: '🛡️', value: '4+ Years', label: 'Security Engineering' },
      { icon: '🏆', value: 'SIH Winner', label: 'Smart India Hackathon' },
      { icon: '⚡', value: 'DevOps', label: 'Terraform, Ansible, Jenkins, etc,...' },
    ],
    primary_cta_label: 'View Architecture & Projects',
    primary_cta_href: '#projects',
    resume_label: 'Download CV',
    terminal_cta_label: 'Launch Terminal CLI',
    portrait_tag: 'Software Engineer at Securden',
    floating_badges: [
      { icon: '🛡️', title: 'Security Platform', text: 'PAM, Vault, Password Self-Serv...' },
      { icon: '⚙️', title: 'IDP and DevOps', text: 'AD, Entra ID, Ansible, Jenkins, Ter...' },
    ],
  },
  about: {
    expertise_title: 'Core Expertise',
    expertise: [
      { title: 'Backend Architecture', description: 'Designing high-throughput, secure, and resilient enterprise applications.' },
      { title: 'Enterprise Integrations', description: 'Seamlessly connecting and integrating extensive DevOps toolchains.' },
      { title: 'Identity Providers', description: 'Implementing and managing Identity Provider (IdP) integrations.' },
      {
        title: 'Automated Tooling',
        description:
          'Scripting automations and streamlining workflows with Playwright, BeautifulSoup4, and Selenium, alongside DevOps tools such as Ansible, Jenkins, Terraform, Chef, and Puppet.',
      },
    ],
    bio_title: 'Software Engineer',
    role_badge: 'ROLE: SENIOR_SOFTWARE_ENGINEER',
    paragraphs: [
      'Software Engineer specializing in the architecture and development of robust enterprise security solutions, secure backend systems, and comprehensive DevOps integrations.',
      'Over 4 years of experience driving backend development, security engineering, and cross-platform solutions.',
      'Proven track record of building secure credential automation pipelines, enhancing password vault workflows, and delivering highly scalable engineering platforms at Securden.',
    ],
    highlights: [
      { icon: '🛡️', title: 'Security Engineering', description: 'Platform Integrations & DevOps Integration' },
      { icon: '🏆', title: 'Achievement', description: 'SIH 2022 Winner' },
      { icon: '🎓', title: 'Mentorship', description: 'Peer Mentorship & Jury Member' },
    ],
  },
  contact: {
    intro: "If you'd like to collaborate, discuss opportunities, or build robust and secure software solutions — feel free to reach out.",
    roles: "I'm open to roles in Platform Engineering, Security Engineering, Identity provider integrations, DevOps tools integration, and Product Engineering.",
    form_heading: 'Send a Direct Transmission',
    form_subheading: 'Whether you want to discuss platform engineering, security architectures, mentorship, or new opportunities.',
    methods: [
      { name: 'Email', icon: '📧', value: 'contact@abishek.in', link: 'mailto:contact@abishek.in' },
      { name: 'Phone', icon: '📱', value: '+91 72002 63991', link: 'tel:+917200263991' },
      { name: 'LinkedIn', icon: '💼', value: 'LinkedIn', link: 'https://linkedin.com/in/abishek-v-p' },
      { name: 'GitHub', icon: '💻', value: 'github.com/abishekvp', link: 'https://github.com/abishekvp' },
      { name: 'Instagram', icon: '📷', value: 'abiraj.vp06', link: 'https://instagram.com/abiraj.vp06' },
    ],
    socials: [
      { name: 'GitHub', link: 'https://github.com/abishekvp' },
      { name: 'LinkedIn', link: 'https://linkedin.com/in/abishek-v-p' },
      { name: 'Instagram', link: 'https://instagram.com/abiraj.vp06' },
    ],
    footer_text: 'Architected with high-assurance platform standards.',
  },
  skills_meta: {
    categories: [
      { name: 'Backend & Platform', icon: '⚙️' },
      { name: 'Identity Providers', icon: '🛡️' },
      { name: 'DevOps Tools', icon: '🔧' },
      { name: 'Other Stacks', icon: '💻' },
    ],
  },
  seo: {
    site_title: 'Abishek VP – Senior Software Engineer | Platform Security, IAM, Automation',
    description:
      'Portfolio of Abishek VP, a Senior Software Engineer specializing in platform engineering, IAM, SSPR, secure DevOps integrations, and automation workflows. SIH 2024 Winner.',
    keywords:
      'Abishek VP, Platform Engineer, Security Engineer, SSPR Developer, IAM Engineer, DevOps Automation, Terraform, Azure AD Integration, Smart India Hackathon, Python Developer, Django Developer',
    author: 'Abishek VP',
  },
};

export const experience = [
  {
    job_title: 'Software Engineer',
    company: 'Securden',
    company_url: 'https://www.securden.com/',
    job_type: 'full_time',
    location: 'India',
    start_date: 'Mar 2024',
    end_date: 'Present',
    is_current: true,
    description: 'PAM • AD/Azure/Google Workspace • DevOps Integrations • Password Self-Service • API',
    achievements: [
      'Architected and built an enterprise-grade Self-Service Password Reset (SSPR) platform with multi-directory support, focusing on high availability and secure architecture.',
      'Engineered robust Password Vault workflows, implementing Just-In-Time (JIT) access, complex approval chains, and secure, policy-based access controls.',
      'Developed secure architectural integrations for major identity providers, including Azure AD, Google Workspace, and Active Directory, ensuring seamless and safe data synchronization.',
      'Built and maintained custom infrastructure plugins for Terraform, Jenkins, Ansible, Chef, and Puppet to enable secure CRUD operations on secrets within CI/CD pipelines.',
      'Enhanced secure browser extension, creating encrypted and user-friendly credential autofill ecosystem.',
    ],
    technologies: ['PAM', 'Active Directory', 'Azure AD', 'Google Workspace', 'Terraform', 'Jenkins', 'Ansible', 'Chef', 'Puppet', 'REST APIs'],
  },
  {
    job_title: 'Software Engineer',
    company: 'DAAT',
    company_url: 'https://daat.group/',
    job_type: 'full_time',
    location: 'India',
    start_date: 'May 2022',
    end_date: 'Feb 2024',
    description: 'Backend & Platform Engineering',
    achievements: [
      'Mentored junior developers to deliver scalable backend solutions, successfully navigating complex technical requirements across diverse tech stacks.',
      'Designed and implemented backend operational workflows, delivering production-ready features for a high-traffic SaaS platform and a Student Management System.',
      'Spearheaded the rebuilding of legacy software and websites, with minimal resources to significantly improve overall system efficiency and modernizing the UI/UX.',
      'Architected and single-handedly developed a custom internal project management tool to streamline organizational workflows, task tracking, and team collaboration.',
    ],
    technologies: ['Python', 'Django', 'PostgreSQL', 'REST APIs'],
  },
  {
    job_title: 'Software Engineer',
    company: 'ROOK',
    company_url: 'https://rookhq.com/',
    job_type: 'full_time',
    location: 'India',
    start_date: 'Aug 2020',
    end_date: 'Apr 2022',
    description: 'Web Application Development',
    achievements: [
      'Developed full-stack application modules using Python, Django, JavaScript, and SQL, driving features from market research to production deployment.',
      'Delivered robust, production-ready backend features for consumer-facing web applications.',
      'Rebuilt and modernized brand software interfaces, improving user experience and application performance.',
    ],
    technologies: ['Python', 'Django', 'JavaScript', 'SQL'],
  },
];

const skill = (name, category, extra = {}) => ({ name, category, ...extra });
export const skills = [
  skill('Python / Django', 'Backend & Platform', { proficiency: 95 }),
  skill('API Design', 'Backend & Platform', { proficiency: 90 }),
  skill('Database (SQL, PostgreSQL, MongoDB)', 'Backend & Platform', { proficiency: 90 }),
  skill('Web Automation (Selenium, BS4, Playwright)', 'Backend & Platform', { proficiency: 88 }),
  skill('Active Directory', 'Identity Providers', { proficiency: 92 }),
  skill('Entra ID', 'Identity Providers', { proficiency: 90 }),
  skill('Google Workspace', 'Identity Providers', { proficiency: 88 }),
  skill('Ansible, Jenkins, Terraform, Chef, Puppet', 'DevOps Tools', { proficiency: 90, implemented: 'Built Plugin and Published' }),
  skill('Java, C, C++', 'Other Stacks', { proficiency: 85 }),
  skill('React, Ember, JavaScript', 'Other Stacks', { proficiency: 85 }),
  skill('HTML, CSS', 'Other Stacks', { proficiency: 90 }),
];

export const projects = [
  {
    title: 'GrantBase.gov.in – SIH Winner',
    description:
      'Built a government research grant intelligence platform that fetches real-time grant data from multiple portals. Engineered the backend to provide domain-based recommendations and automated alerts for researchers.',
    tags: ['Django', 'BS4', 'GitHub'],
    github_url: 'https://github.com/abishekvp/SIH_DR715',
    is_featured: true,
  },
  {
    title: 'Web Automation for Academic Data Entry',
    description:
      'Developed an automation platform to parse Excel data and automatically populate student records into the OASIS college portal, completely eliminating manual data entry tasks for administrative staff.',
    tags: ['Django', 'Selenium', 'BS4', 'Pandas', 'GitHub'],
    github_url: 'https://github.com/abishekvp/Web-Automation-Streamlining-OASIS-Web-Portal',
    is_featured: true,
  },
  {
    title: 'LEGALTECH – Software Implementation in Law firms',
    description:
      'Engineered a platform bridging legal professionals and clients. Built backend features allowing lawyers to manage case records securely and enabling users to find advocates based on historical case data.',
    tags: ['Django', 'Selenium', 'SQL', 'GitHub'],
    github_url: 'https://github.com/abishekvp/legaltech',
    is_featured: true,
  },
];

export const achievements = [
  {
    icon: '🏆',
    title: 'SIH 2022 Winner',
    description: 'Winner of Smart India Hackathon 2022, a nationwide initiative to provide students a platform to solve some of the pressing problems we face in our daily lives.',
    issuer: 'Ministry of Education & AICTE, Government of India',
    date_label: 'Aug 2022',
  },
  {
    icon: '🎤',
    title: 'AI Horizon 2022',
    description: 'Orchestrated AI Horizon 2022, leading the organization and execution of the event focused on Artificial Intelligence advancements.',
    date_label: '2022',
  },
  {
    icon: '👨‍🏫',
    title: 'Peer Mentorship',
    description: 'Conducted placement training for batchmates covering Web Development (HTML, CSS, JS), Figma designing, Git/GitHub, and hosting static websites with GitHub Pages.',
  },
  {
    icon: '⚖️',
    title: 'Jury Member',
    description: 'Served as a Jury member for St. Thomas College Internal Hackathon 2024, evaluating innovative projects and selecting teams for the national level.',
    date_label: '2024',
  },
];
