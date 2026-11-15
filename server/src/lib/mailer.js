// Sends transactional email. Which provider is used depends on environment variables:
//   SMTP_HOST (+ SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE)  -> any SMTP server (Gmail, Outlook, Brevo, ...)
//   RESEND_API_KEY                                               -> Resend (https://resend.com)
//   neither                                                      -> the message is written to the server log
// MAIL_FROM sets the sender, e.g.  Inventra <no-reply@yourdomain.com>

const APP_NAME = "Inventra";

function configuredProvider() {
  if (process.env.SMTP_HOST) return "smtp";
  if (process.env.RESEND_API_KEY) return "resend";
  return "log";
}

async function sendViaSmtp({ to, subject, text, html }) {
  const nodemailer = require("nodemailer");
  const port = Number(process.env.SMTP_PORT || 587);
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : port === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
  await transport.sendMail({ from: process.env.MAIL_FROM || process.env.SMTP_USER, to, subject, text, html });
}

async function sendViaResend({ to, subject, text, html }) {
  const res = await fetch(process.env.RESEND_API_URL || "https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.MAIL_FROM || `${APP_NAME} <onboarding@resend.dev>`, to: [to], subject, text, html }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend responded ${res.status}: ${body.slice(0, 300)}`);
  }
}

async function sendMail(message) {
  const provider = configuredProvider();
  if (provider === "smtp") await sendViaSmtp(message);
  else if (provider === "resend") await sendViaResend(message);
  else {
    // No email provider configured: make the message retrievable from the server log
    console.warn(
      `[mail] No email provider configured (set SMTP_HOST or RESEND_API_KEY). Message for ${message.to}:\n${message.subject}\n${message.text}`
    );
  }
  return provider;
}

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function passwordResetEmail({ name, link, minutes }) {
  const subject = `Reset your ${APP_NAME} password`;
  const text = [
    `Hi ${name},`,
    "",
    `We received a request to reset your ${APP_NAME} password. Use this link to choose a new one (valid for ${minutes} minutes):`,
    "",
    link,
    "",
    "If you didn't ask for this, you can ignore this email. Your password won't change.",
  ].join("\n");
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f9fafb;font-family:Inter,Segoe UI,Arial,sans-serif;color:#111827">
  <div style="max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;padding:32px">
    <div style="font-size:20px;font-weight:700;margin-bottom:16px">Inven<span style="color:#b91c1c">tra</span></div>
    <p style="margin:0 0 12px">Hi ${escapeHtml(name)},</p>
    <p style="margin:0 0 20px;line-height:1.5">We received a request to reset your password. Click the button below to choose a new one. The link is valid for ${minutes} minutes.</p>
    <p style="margin:0 0 24px"><a href="${escapeHtml(link)}" style="display:inline-block;background:#b91c1c;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:12px">Reset password</a></p>
    <p style="margin:0 0 6px;font-size:13px;color:#6b7280">Or paste this link into your browser:</p>
    <p style="margin:0 0 20px;font-size:12px;color:#6b7280;word-break:break-all">${escapeHtml(link)}</p>
    <p style="margin:0;font-size:13px;color:#6b7280">If you didn't ask for this, you can safely ignore this email. Your password won't change.</p>
  </div></body></html>`;
  return { subject, text, html };
}

module.exports = { sendMail, passwordResetEmail, configuredProvider };
