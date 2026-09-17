const nodemailer = require('nodemailer');
const env = require('../config/env');
const logger = require('../utils/logger');

// Provider-agnostic like storageService: real SMTP delivery when
// SMTP_HOST is configured, otherwise falls back to logging the message
// (via nodemailer's jsonTransport, which formats but never sends) so
// local development and CI don't need real mail credentials.
const transporter = env.smtp.host
  ? nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.port === 465,
      auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
    })
  : nodemailer.createTransport({ jsonTransport: true });

const send = async ({ to, subject, text, html }) => {
  const info = await transporter.sendMail({ from: env.smtp.from, to, subject, text, html });

  if (!env.smtp.host) {
    // This branch only runs when SMTP_HOST is unset — i.e. never against a
    // real mailbox, only local dev/CI where jsonTransport stands in for
    // delivery. Printing the body here (temp passwords, reset links) is
    // the fallback's whole purpose, not an exception to "never log
    // secrets" (logger.js) — without it, e.g. a driver's server-generated
    // temp password would be generated, "sent", and then unrecoverable.
    logger.warn(`Email not sent (SMTP not configured) — printing instead: "${subject}" to ${to}\n${text}`);
  }

  return info;
};

const sendPasswordResetEmail = async (toEmail, rawToken) => {
  const resetUrl = `${env.appWebUrl}/reset-password?token=${rawToken}`;
  await send({
    to: toEmail,
    subject: 'Reset your Fleet Management password',
    text: `Reset your password using this link (valid for 15 minutes): ${resetUrl}`,
    html: `<p>Reset your password using the link below (valid for 15 minutes):</p><p><a href="${resetUrl}">${resetUrl}</a></p>`,
  });
};

const sendWelcomeEmail = async (toEmail, tempPassword) => {
  await send({
    to: toEmail,
    subject: "You've been added to Fleet Management",
    text: `An account has been created for you.\n\nEmail: ${toEmail}\nTemporary password: ${tempPassword}\n\nLog in and change your password as soon as possible.`,
    html: `<p>An account has been created for you.</p><p><b>Email:</b> ${toEmail}<br/><b>Temporary password:</b> ${tempPassword}</p><p>Log in and change your password as soon as possible.</p>`,
  });
};

module.exports = { send, sendPasswordResetEmail, sendWelcomeEmail };
