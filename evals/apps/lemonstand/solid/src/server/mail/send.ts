
import { createTransport, type Transporter } from "nodemailer";

import { env } from "~/env.server";

/**
 * Outbound mail, ported from technomancyIT. Fails loudly in the log and softly
 * to the caller: a signup that was saved must never be reported as failed just
 * because the notification about it could not be sent.
 */
type Sent = { messageId?: string | undefined };

let cached: Transporter<Sent> | null = null;

const transport = (): Transporter<Sent> | null => {
  if (cached) return cached;
  if (!env().SMTP_HOST || !env().SMTP_USER || !env().SMTP_PASSWORD) return null;
  cached = createTransport({
    host: env().SMTP_HOST,
    port: env().SMTP_PORT,
    // 465 is implicit TLS; anything else negotiates STARTTLS.
    secure: env().SMTP_PORT === 465,
    auth: { user: env().SMTP_USER, pass: env().SMTP_PASSWORD },
  });
  return cached;
};

export type Mail = {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html?: string;
  readonly replyTo?: string;
};

export const isMailConfigured = (): boolean => transport() !== null;

export const sendMail = async (mail: Mail): Promise<{ sent: boolean; reason?: string }> => {
  const mailer = transport();
  if (!mailer) {
    console.warn(`[mail] not configured; skipped "${mail.subject}" to ${mail.to}`);
    return { sent: false, reason: "smtp not configured" };
  }
  try {
    await mailer.sendMail({
      from: env().MAIL_FROM,
      replyTo: mail.replyTo ?? env().MAIL_REPLY_TO,
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
      ...(mail.html ? { html: mail.html } : {}),
    });
    return { sent: true };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`[mail] failed to send "${mail.subject}" to ${mail.to}: ${reason}`);
    return { sent: false, reason };
  }
};
