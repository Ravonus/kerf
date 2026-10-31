/**
 * Plain-language policies for the marketing site only (lemonstand.ai), covering
 * what this site actually does: early-access signups and the contact form.
 * The full product platform has its own drafts in the product repo
 * (docs/legal/), pending counsel review. Have counsel review these before launch.
 */
export type LegalSection = { heading: string; body: string[] };
export type LegalDoc = { title: string; updated: string; intro: string; sections: LegalSection[] };

const CONTACT = "hello@lemonstand.ai";

export const privacy: LegalDoc = {
  title: "Privacy notice",
  updated: "October 5, 2026",
  intro:
    "This notice covers lemonstand.ai, our website. It explains what we collect when you join early access or send us a message, and what we do with it. The short version: we collect very little, we use it only to talk to you about Lemonstand, and we never sell it.",
  sections: [
    {
      heading: "What we collect",
      body: [
        "Early access: your email address, and, if you choose, your role (for example parent, teacher, or librarian).",
        "Contact form: your name, email, role, and anything you choose to tell us, such as your organization, the programs you're interested in, roughly how many young people might take part, and your message.",
        "Technical basics: your browser's user-agent string, stored with your submission to help us spot spam. Your IP address is used briefly in memory to rate-limit form spam. It is not stored with your submission.",
        "We don't use advertising trackers, and we don't buy data about you from anyone.",
      ],
    },
    {
      heading: "How we use it",
      body: [
        "To email you about early access, reply to your message, and plan pilots with schools, libraries, districts, and partners.",
        "When you sign up or write to us, we send you a confirmation email and our team gets a copy so a real person can follow up.",
        "We never sell your information, never use it for ads, and never share it with anyone except the service providers who help us run the site (hosting, database, and email delivery), who may use it only for that purpose.",
      ],
    },
    {
      heading: "Kids and young people",
      body: [
        "Lemonstand is built for young people, but this website's forms are meant for adults and teens 13 and older. If you're under 13, please ask a parent, guardian, or teacher to sign up or contact us for you.",
        "If we learn we've collected an email from a child under 13 through this site, we'll delete it. Parents can ask us to do that at any time.",
        "The Lemonstand program itself is designed around COPPA and FERPA, with parent and school approval built in. We'll share our full privacy, security, and AI-safety documentation with any family, school, or district that asks.",
      ],
    },
    {
      heading: "How long we keep it",
      body: [
        "We keep early-access and contact information until early access opens and our conversation is done, or until you ask us to delete it, whichever comes first.",
      ],
    },
    {
      heading: "Your choices",
      body: [
        `You can ask us to show, correct, or delete what we have about you at any time. Just email ${CONTACT}. Every email we send also tells you how to stop hearing from us.`,
      ],
    },
    {
      heading: "Changes and contact",
      body: [
        "If we change this notice, we'll update the date at the top. If a change is significant, we'll tell people on our early-access list.",
        `Questions? Email ${CONTACT}.`,
      ],
    },
  ],
};

export const terms: LegalDoc = {
  title: "Terms of use",
  updated: "October 5, 2026",
  intro:
    "These terms cover your use of lemonstand.ai, our website. The Lemonstand program itself will come with its own terms for families, schools, and partners when early access opens.",
  sections: [
    {
      heading: "Using this site",
      body: [
        "You're welcome to browse the site, join early access, and contact us. Please give accurate information and don't use the forms to send spam, abuse, or anything unlawful.",
        "The forms are for adults and teens 13 and older. Younger kids should ask a parent, guardian, or teacher to reach out for them.",
      ],
    },
    {
      heading: "Early access",
      body: [
        "Joining early access is free and doesn't commit you to anything. Program details, formats, timelines, and pricing described on this site may change as we work with pilot partners.",
      ],
    },
    {
      heading: "Our content",
      body: [
        "The Lemonstand name, the Lemon character, our logo, and the content on this site belong to Lemonstand.ai. Please don't reuse them without asking. We're usually happy to say yes for educational use.",
      ],
    },
    {
      heading: "No warranties",
      body: [
        "We work hard to keep this site accurate and available, but it's provided as-is, and to the extent the law allows, we aren't liable for losses that come from using it.",
      ],
    },
    {
      heading: "Privacy",
      body: ["Our privacy notice explains what we collect through this site and how we use it."],
    },
    {
      heading: "Contact",
      body: [`Questions about these terms? Email ${CONTACT}.`],
    },
  ],
};
