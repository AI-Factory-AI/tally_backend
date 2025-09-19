import { Resend } from 'resend';
import nodemailer from 'nodemailer';

type MailerConfig = {
  host: string;
  port: number;
  secure: boolean;
  auth: { user: string; pass: string } | undefined;
  fromEmail: string;
};

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM = process.env.RESEND_FROM || 'Tally <no-reply@yourdomain.com>';

const resolveConfig = async (): Promise<MailerConfig> => {
  const fromEmail = process.env.FROM_EMAIL || 'no-reply@yourdomain.com';
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (host && port && user && pass) {
    return {
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
      fromEmail,
    };
  }

  // Fallback to Ethereal for development only
  const testAccount = await nodemailer.createTestAccount();
  return {
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
    auth: { user: testAccount.user, pass: testAccount.pass },
    fromEmail: fromEmail || testAccount.user,
  };
};

const getTransporter = async () => {
  const cfg = await resolveConfig();
  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: cfg.auth,
  });
  return { transporter, fromEmail: cfg.fromEmail };
};

const buildText = (lines: string[]) => lines.join('\n');

const formatKeyForEmail = (key: string) =>
  (key || '')
    .replace(/\s+/g, '')
    .match(/.{1,4}/g)
    ?.join(' ')
    .toUpperCase() || key;

const buildHtml = (title: string, paragraphs: string[], afterHtml: string = '') => `
  <div style="margin:0;padding:0;background-color:#f4f6f8;width:100%;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" width="100%" style="background-color:#f4f6f8;">
      <tr>
        <td>
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" width="600" style="margin:24px auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e6e9ee;">
            <tr>
              <td style="background:linear-gradient(135deg,#0ea5e9,#2563eb);padding:20px 24px;color:#ffffff;">
                <div style="font-size:18px;font-weight:700;letter-spacing:.3px;">Tally Voting</div>
                <div style="font-size:14px;opacity:.9;margin-top:6px;">Secure, transparent, and verifiable voting</div>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 24px 8px 24px;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
                <h2 style="margin:0 0 10px 0;font-size:20px;line-height:1.3;">${title}</h2>
                ${paragraphs.map(p => `<p style="margin:10px 0 8px 0;font-size:14px;line-height:1.7;color:#334155;">${p}</p>`).join('')}
                ${afterHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:0 24px 8px 24px;">
                <hr style="border:none;border-top:1px solid #e6e9ee;margin:16px 0;"/>
              </td>
            </tr>
            <tr>
              <td style="padding:0 24px 24px 24px;font-family:Arial,Helvetica,sans-serif;color:#334155;font-size:12px;">
                <p style="margin:0 0 4px 0;">If you didn’t request this email, you can safely ignore it.</p>
              </td>
            </tr>
            <tr>
              <td style="background:#f8fafc;padding:16px 24px;color:#64748b;font-family:Arial,Helvetica,sans-serif;font-size:12px;">
                <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
                  <span>© ${new Date().getFullYear()} Tally. All rights reserved.</span>
                  <span>
                    <a href="#" style="color:#2563eb;text-decoration:none;">Privacy</a>
                    &nbsp;•&nbsp;
                    <a href="#" style="color:#2563eb;text-decoration:none;">Help</a>
                  </span>
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </div>
`;

const buildElectionUrlSection = (electionUrl: string, voteUrl: string) => `
  <div style="margin:12px 0 0 0;">
    <p style="margin:8px 0;color:#475569;font-size:14px;">
      Access your election:
    </p>
    <p style="margin:4px 0;color:#475569;font-size:14px;">
      <a href="${voteUrl}" style="color:#2563eb;text-decoration:none;font-weight:600;">Vote now</a>
    </p>
  </div>
`;

export default {
  async sendVoterCredentialsEmail(params: {
    to: string;
    voterName?: string;
    electionTitle: string;
    voterId: string;
    voterKey: string;
    voteUrl: string;
    electionUrl?: string;
  }) {
    // Prefer Resend if API key available
    if (RESEND_API_KEY) {
      const resend = new Resend(RESEND_API_KEY);
      const subject = `You're invited to vote: ${params.electionTitle}`;
      const prettyKey = formatKeyForEmail(params.voterKey);
      let electionUrl = params.electionUrl;
      if (!electionUrl) {
        try {
          const u = new URL(params.voteUrl);
          electionUrl = `${u.origin}/voter/dashboard`;
        } catch {
          electionUrl = 'http://localhost:5173/voter/dashboard';
        }
      }
      const afterHtml = (
        buildElectionUrlSection(electionUrl, params.voteUrl) +
        '<p style="margin:10px 0 8px 0;font-size:14px;line-height:1.7;color:#334155;">Keep your Voter Key secret. It is required to validate your vote.</p>'
      );
      const html = buildHtml('You are invited to vote', [
        `Hello ${params.voterName || 'Voter'},`,
        `You have been added as a voter for <b>${params.electionTitle}</b>.`,
        `<b>Voter ID:</b> ${params.voterId}<br/><b>Voter Key:</b> <code style="font-family:monospace">${prettyKey}</code>`
      ], afterHtml);
      const text = buildText([
        `Hello ${params.voterName || 'Voter'},`,
        `You have been added as a voter for "${params.electionTitle}".`,
        `Voter ID: ${params.voterId}`,
        `Voter Key: ${prettyKey}`,
        '',
        'Access your election:',
        `Vote now: ${params.voteUrl}`,
        '',
        'Keep your Voter Key secret. It is required to validate your vote.',
      ]);
      const { data, error } = await resend.emails.send({
        from: RESEND_FROM,
        to: [params.to],
        subject,
        html,
        text,
      } as any);
      if (error) throw new Error((error as any).message || 'Resend send failed');
      return { messageId: (data as any)?.id };
    }

    const { transporter, fromEmail } = await getTransporter();
    const subject = `You're invited to vote: ${params.electionTitle}`;
    const prettyKey = formatKeyForEmail(params.voterKey);
    let electionUrl = params.electionUrl;
    if (!electionUrl) {
      try {
        const u = new URL(params.voteUrl);
        electionUrl = `${u.origin}/voter/dashboard`;
      } catch {
        electionUrl = 'http://localhost:5173/voter/dashboard';
      }
    }
    const text = buildText([
      `Hello ${params.voterName || 'Voter'},`,
      `You have been added as a voter for "${params.electionTitle}".`,
      `Voter ID: ${params.voterId}`,
      `Voter Key: ${prettyKey}`,
      '',
      'Access your election:',
      `Vote now: ${params.voteUrl}`,
      '',
      'Keep your Voter Key secret. It is required to validate your vote.',
    ]);
    const html = buildHtml('You are invited to vote', [
      `Hello ${params.voterName || 'Voter'},`,
      `You have been added as a voter for <b>${params.electionTitle}</b>.`,
      `<b>Voter ID:</b> ${params.voterId}<br/><b>Voter Key:</b> <code style="font-family:monospace">${prettyKey}</code>`
    ], buildElectionUrlSection(electionUrl, params.voteUrl) +
       '<p style="margin:10px 0 8px 0;font-size:14px;line-height:1.7;color:#334155;">Keep your Voter Key secret. It is required to validate your vote.</p>'
    );

    const info = await transporter.sendMail({
      from: fromEmail,
      to: params.to,
      subject,
      text,
      html,
    });

    if (nodemailer.getTestMessageUrl(info)) {
      console.log('Ethereal preview URL:', nodemailer.getTestMessageUrl(info));
    }
    return info;
  },

  async sendVoterVerificationEmail(params: {
    voterName?: string;
    voterEmail: string;
    electionTitle: string;
    verificationToken: string;
    frontendUrl: string;
  }) {
    if (RESEND_API_KEY) {
      const resend = new Resend(RESEND_API_KEY);
      const verifyUrl = `${params.frontendUrl}/verify/${params.verificationToken}`;
      const subject = `Verify your voter account for ${params.electionTitle}`;
      const html = buildHtml('Verify your voter account', [
        `Hello ${params.voterName || 'Voter'},`,
        `Please verify your email to activate your voter account for <b>${params.electionTitle}</b>.`,
        `<a href="${verifyUrl}" target="_blank">Verify email</a>`,
      ]);
      const text = buildText([
        `Hello ${params.voterName || 'Voter'},`,
        'Please verify your email to activate your voter account.',
        `Verification link: ${verifyUrl}`,
      ]);
      const { data, error } = await (new Resend(RESEND_API_KEY)).emails.send({
        from: RESEND_FROM,
        to: [params.voterEmail],
        subject,
        html,
        text,
      } as any);
      if (error) throw new Error((error as any).message || 'Resend send failed');
      return { messageId: (data as any)?.id };
    }

    const { transporter, fromEmail } = await getTransporter();
    const verifyUrl = `${params.frontendUrl}/verify/${params.verificationToken}`;
    const subject = `Verify your voter account for ${params.electionTitle}`;
    const text = buildText([
      `Hello ${params.voterName || 'Voter'},`,
      'Please verify your email to activate your voter account.',
      `Verification link: ${verifyUrl}`,
    ]);
    const html = buildHtml('Verify your voter account', [
      `Hello ${params.voterName || 'Voter'},`,
      `Please verify your email to activate your voter account for <b>${params.electionTitle}</b>.`,
      `<a href="${verifyUrl}" target="_blank">Verify email</a>`,
    ]);

    const info = await transporter.sendMail({
      from: fromEmail,
      to: params.voterEmail,
      subject,
      text,
      html,
    });
    if (nodemailer.getTestMessageUrl(info)) {
      console.log('Ethereal preview URL:', nodemailer.getTestMessageUrl(info));
    }
    return info;
  },

  async sendVoterStatusUpdateEmail(to: string, name: string, electionTitle: string, status: string) {
    if (RESEND_API_KEY) {
      const resend = new Resend(RESEND_API_KEY);
      const subject = `Your voter status changed: ${status}`;
      const html = buildHtml('Voter status updated', [
        `Hello ${name || 'Voter'},`,
        `Your status for <b>${electionTitle}</b> is now: <b>${status}</b>.`,
      ]);
      const text = buildText([
        `Hello ${name || 'Voter'},`,
        `Your status for "${electionTitle}" is now: ${status}.`,
      ]);
      const { data, error } = await resend.emails.send({
        from: RESEND_FROM,
        to: [to],
        subject,
        html,
        text,
      } as any);
      if (error) throw new Error((error as any).message || 'Resend send failed');
      return { messageId: (data as any)?.id };
    }

    const { transporter, fromEmail } = await getTransporter();
    const subject = `Your voter status changed: ${status}`;
    const text = buildText([
      `Hello ${name || 'Voter'},`,
      `Your status for "${electionTitle}" is now: ${status}.`,
    ]);
    const html = buildHtml('Voter status updated', [
      `Hello ${name || 'Voter'},`,
      `Your status for <b>${electionTitle}</b> is now: <b>${status}</b>.`,
    ]);
    const info = await transporter.sendMail({ from: fromEmail, to, subject, text, html });
    if (nodemailer.getTestMessageUrl(info)) {
      console.log('Ethereal preview URL:', nodemailer.getTestMessageUrl(info));
    }
    return info;
  },
};
