
import { env } from "~/env.server";
import { INTERESTS, LEARNER_COUNTS, ROLES } from "~/lib/leads";
import type { ContactInput } from "../lead-input";
import { render, type Block } from "./blocks";
import { sendMail } from "./send";

const label = <T extends readonly { value: string; label: string }[]>(list: T, v?: string) =>
  list.find((o) => o.value === v)?.label ?? v ?? "Not given";

const alertInboxes = () =>
  (env().LEAD_ALERT_EMAIL ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

async function alertTeam(subject: string, blocks: Block[], replyTo: string) {
  const { html, text } = render(blocks, subject);
  await Promise.all(alertInboxes().map((to) => sendMail({ to, subject, html, text, replyTo })));
}

/** New early-access signup: welcome the person, ping the team. */
export async function sendWaitlistMail(input: { email: string; role?: string; source?: string }) {
  const welcome = render(
    [
      { kind: "eyebrow", text: "Early access" },
      { kind: "heading", text: "You're on the list!" },
      {
        kind: "paragraph",
        text: "Thanks for backing Lemonstand. We're building a place where young people turn an idea into a real small business, with an AI coach that asks good questions and leaves the work to them.",
      },
      {
        kind: "paragraph",
        text: "We'll email you when early access opens. If you're a teacher, librarian, district, or nonprofit and want to run a pilot, just reply to this email and tell us what you're picturing.",
      },
      { kind: "button", label: "See the programs", url: `${env().SITE_URL}/#programs` },
      { kind: "note", text: "You're getting this because you joined early access at lemonstand.ai. Not you? Ignore this email and we won't send another." },
    ],
    "Thanks for joining Lemonstand early access.",
  );

  await Promise.all([
    sendMail({ to: input.email, subject: "You're on the Lemonstand early-access list", ...welcome }),
    alertTeam(
      `New early-access signup: ${input.email}`,
      [
        { kind: "eyebrow", text: "Waitlist" },
        { kind: "heading", text: "New early-access signup" },
        { kind: "detail", label: "Email", value: input.email },
        { kind: "detail", label: "Role", value: label(ROLES, input.role) },
        { kind: "detail", label: "Form", value: input.source ?? "unknown" },
      ],
      input.email,
    ),
  ]);
}

/** New contact message: full details to the team (reply goes to the sender), receipt to the sender. */
export async function sendContactMail(input: ContactInput) {
  const first = input.name.split(" ")[0] ?? input.name;
  const interests = input.interests.map((i) => label(INTERESTS, i)).join(", ") || "None picked";
  const who = input.organization ? `${input.name} (${input.organization})` : input.name;

  const receipt = render(
    [
      { kind: "eyebrow", text: "Message received" },
      { kind: "heading", text: `Thanks, ${first}!` },
      {
        kind: "paragraph",
        text: "A real person on our team reads every note, and we'll get back to you soon. You're also on the early-access list.",
      },
      { kind: "quote", text: input.message },
      { kind: "note", text: "Want to add something? Just reply to this email." },
    ],
    "We got your message. A real person will reply soon.",
  );

  await Promise.all([
    sendMail({ to: input.email, subject: "We got your message: Lemonstand", ...receipt }),
    alertTeam(
      `Lemonstand contact: ${who}, ${label(ROLES, input.role)}`,
      [
        { kind: "eyebrow", text: "Contact form" },
        { kind: "heading", text: `${who} reached out` },
        { kind: "detail", label: "Email", value: input.email },
        { kind: "detail", label: "Role", value: label(ROLES, input.role) },
        { kind: "detail", label: "Organization", value: input.organization ?? "Not given" },
        { kind: "detail", label: "Interested in", value: interests },
        { kind: "detail", label: "Learners", value: label(LEARNER_COUNTS, input.learnerCount) },
        { kind: "quote", text: input.message },
        { kind: "note", text: "Hit reply to answer them directly." },
      ],
      input.email,
    ),
  ]);
}
