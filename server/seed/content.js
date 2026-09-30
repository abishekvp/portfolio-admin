// Initial content, taken from the existing portfolio site (abishek/src/data/portfolio.json
// and the hard-coded Hero / Achievements sections) so the admin starts fully populated.

export const settings = {
  profile: {
    full_name: 'Abishek VP',
    headline: 'Software Engineer',
    summary: [
      'Software Engineer specializing in the architecture and development of robust enterprise security solutions, secure backend systems, and comprehensive DevOps integrations.',
      'Over 4 years of experience driving backend development, security engineering, and cross-platform solutions.',
      'Proven track record of building secure credential automation pipelines, enhancing password vault workflows, and delivering highly scalable engineering platforms at Securden.',
    ].join('\n\n'),
    location: 'India',
    availability: 'Open to Platform & Security Engineering roles',
    email: 'contact@abishek.in',
    phone: '+91 72002 63991',
    resume_filename: 'Abishek_VP_Resume.pdf',
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

export const contacts = [
  { type: 'email', label: 'Email', value: 'contact@abishek.in', icon: '📧' },
  { type: 'phone', label: 'Phone', value: '+91 72002 63991', icon: '📱' },
  { type: 'linkedin', label: 'LinkedIn', value: 'LinkedIn', link: 'https://linkedin.com/in/abishek-v-p', icon: '💼' },
  { type: 'github', label: 'GitHub', value: 'github.com/abishekvp', link: 'https://github.com/abishekvp', icon: '💻' },
  { type: 'instagram', label: 'Instagram', value: 'abiraj.vp06', link: 'https://instagram.com/abiraj.vp06', icon: '📷' },
];

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
