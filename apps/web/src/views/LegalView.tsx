import styles from "./LegalView.module.css";

type DocKey = "privacy" | "terms" | "data-deletion";

type DocSection = {
  heading: string;
  body: string[];
};

type LegalDoc = {
  title: string;
  updated: string;
  intro: string[];
  sections: DocSection[];
};

const docs: Record<DocKey, LegalDoc> = {
  privacy: {
    title: "Privacy Policy",
    updated: "February 1, 2026",
    intro: [
      "This Privacy Policy explains how Escapers (\"we\", \"us\") collects, uses, and shares information when you use escapers.app.",
      "By using the service, you agree to the practices described below.",
    ],
    sections: [
      {
        heading: "Information we collect",
        body: [
          "Account info: display name, email address, and auth provider identifiers (Google, Apple, X, Facebook) when you choose to sign in.",
          "Gameplay info: room code, answers, scores, and timestamps generated during a game.",
          "Device and log data: IP address, browser type, device identifiers, and diagnostic logs.",
          "Analytics: basic usage events collected through Google Analytics and Firebase Analytics.",
        ],
      },
      {
        heading: "How we use information",
        body: [
          "Provide and operate the game, including joining rooms, scoring, and leaderboards.",
          "Maintain security, prevent abuse, and debug issues.",
          "Improve product performance and user experience.",
        ],
      },
      {
        heading: "Sharing",
        body: [
          "We do not sell personal information.",
          "We may share data with service providers that help us run the app (hosting, analytics, authentication).",
          "We may disclose information if required by law or to protect our rights and users.",
        ],
      },
      {
        heading: "Cookies and similar technologies",
        body: [
          "We use cookies and local storage to keep you signed in, remember preferences, and measure usage.",
          "You can control cookies in your browser settings.",
        ],
      },
      {
        heading: "Data retention",
        body: [
          "We keep data as long as needed to operate the service and comply with legal obligations.",
          "You can request deletion at any time; see the Data Deletion page for instructions.",
        ],
      },
      {
        heading: "Your choices",
        body: [
          "You can update your display name in the app.",
          "You can request access or deletion of your data by emailing support@escapers.app.",
        ],
      },
      {
        heading: "Children",
        body: [
          "The service is intended for users age 13 and older. We do not knowingly collect data from children under 13.",
        ],
      },
      {
        heading: "Changes",
        body: [
          "We may update this policy from time to time. The \"Last updated\" date reflects the latest version.",
        ],
      },
      {
        heading: "Contact",
        body: [
          "Questions? Email support@escapers.app.",
        ],
      },
    ],
  },
  terms: {
    title: "Terms of Service",
    updated: "February 1, 2026",
    intro: [
      "These Terms of Service (\"Terms\") govern your use of escapers.app.",
      "By accessing or using the service, you agree to these Terms.",
    ],
    sections: [
      {
        heading: "Eligibility",
        body: [
          "You must be at least 13 years old to use the service.",
        ],
      },
      {
        heading: "Accounts",
        body: [
          "You may play as a guest or sign in using a supported provider.",
          "You are responsible for activity under your account and for keeping your login credentials secure.",
        ],
      },
      {
        heading: "Acceptable use",
        body: [
          "Do not cheat, exploit bugs, reverse engineer, or disrupt the service.",
          "Do not upload content that is unlawful, abusive, or violates rights of others.",
        ],
      },
      {
        heading: "User content",
        body: [
          "You retain ownership of any content you provide.",
          "You grant us a non-exclusive license to use it for operating and improving the service.",
        ],
      },
      {
        heading: "Intellectual property",
        body: [
          "The service, branding, and software are owned by Escapers and its licensors.",
        ],
      },
      {
        heading: "Disclaimer",
        body: [
          "The service is provided \"as is\" without warranties of any kind.",
        ],
      },
      {
        heading: "Limitation of liability",
        body: [
          "To the maximum extent permitted by law, we are not liable for indirect, incidental, or consequential damages.",
        ],
      },
      {
        heading: "Termination",
        body: [
          "We may suspend or terminate access if you violate these Terms or misuse the service.",
        ],
      },
      {
        heading: "Governing law",
        body: [
          "These Terms are governed by the laws of the State of Florida, USA, without regard to conflict of laws principles.",
        ],
      },
      {
        heading: "Contact",
        body: [
          "Questions? Email support@escapers.app.",
        ],
      },
    ],
  },
  "data-deletion": {
    title: "Data Deletion Instructions",
    updated: "February 1, 2026",
    intro: [
      "You can request deletion of your personal data at any time.",
    ],
    sections: [
      {
        heading: "How to request deletion",
        body: [
          "Email support@escapers.app with subject \"Data Deletion Request\".",
          "Include the email address and provider you used to sign in (Google, Apple, X, Facebook).",
          "If you used a nickname only, include the nickname and approximate date/time of play.",
        ],
      },
      {
        heading: "What we delete",
        body: [
          "Account identifiers, profile data, and personal gameplay history tied to your account.",
          "We may retain aggregated or anonymized analytics that cannot identify you.",
        ],
      },
      {
        heading: "Timeline",
        body: [
          "We aim to complete requests within 30 days.",
        ],
      },
      {
        heading: "Guest users",
        body: [
          "If you played as a guest, you can clear local data by removing site data for escapers.app in your browser.",
        ],
      },
      {
        heading: "Contact",
        body: [
          "Questions? Email support@escapers.app.",
        ],
      },
    ],
  },
};

const linkItems: { href: string; label: string }[] = [
  { href: "/legal/privacy", label: "Privacy" },
  { href: "/legal/terms", label: "Terms" },
  { href: "/legal/data-deletion", label: "Data deletion" },
];

export default function LegalView({ doc }: { doc: DocKey }) {
  const content = docs[doc];

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <header className={styles.header}>
          <p className={styles.kicker}>Escapers</p>
          <h1 className={styles.title}>{content.title}</h1>
          <p className={styles.meta}>Last updated: {content.updated}</p>
        </header>
        <div className={styles.body}>
          {content.intro.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
          {content.sections.map((section) => (
            <section key={section.heading} className={styles.section}>
              <h2>{section.heading}</h2>
              {section.body.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </section>
          ))}
        </div>
        <nav className={styles.nav}>
          {linkItems.map((link) => (
            <a key={link.href} href={link.href}>
              {link.label}
            </a>
          ))}
        </nav>
      </div>
    </div>
  );
}
