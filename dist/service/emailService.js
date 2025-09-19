"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const resend_1 = require("resend");
const nodemailer_1 = __importDefault(require("nodemailer"));
const RESEND_API_KEY = process.env.RESEND_API_KEY || 're_Dvfac5wz_7hzPX5NGtJ2u5BtVkQqJzXod';
const RESEND_FROM = process.env.RESEND_FROM || 'Acme <onboarding@resend.dev>';
const resolveConfig = async () => {
    const fromEmail = process.env.FROM_EMAIL || 'no-reply@example.com';
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
    // Fallback to Ethereal for development
    const testAccount = await nodemailer_1.default.createTestAccount();
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
    const transporter = nodemailer_1.default.createTransport({
        host: cfg.host,
        port: cfg.port,
        secure: cfg.secure,
        auth: cfg.auth,
    });
    return { transporter, fromEmail: cfg.fromEmail };
};
const buildText = (lines) => lines.join('\n');
const formatKeyForEmail = (key) => (key || '')
    .replace(/\s+/g, '')
    .match(/.{1,4}/g)
    ?.join(' ')
    .toUpperCase() || key;
const buildHtml = (title, paragraphs) => `
  <div style="font-family: Arial, sans-serif; line-height:1.5; color:#111;">
    <h2 style="margin:0 0 12px 0;">${title}</h2>
    ${paragraphs.map(p => `<p style="margin:8px 0;">${p}</p>`).join('')}
        </div>
`;
const buildElectionUrlSection = (electionUrl, voteUrl) => `
  <div style="background-color: #f8f9fa; border: 1px solid #e9ecef; border-radius: 8px; padding: 16px; margin: 16px 0;">
    <h3 style="margin: 0 0 12px 0; color: #495057; font-size: 16px;">🗳️ Election Access</h3>
    <p style="margin: 8px 0; color: #6c757d; font-size: 14px;">Use one of these links to access the election:</p>
    <div style="margin: 12px 0;">
      <p style="margin: 4px 0; font-weight: 600; color: #495057;">Direct Voting Link:</p>
      <a href="${voteUrl}" style="display: inline-block; background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: 500; margin: 4px 0;">Vote Now</a>
          </div>
    <div style="margin: 12px 0;">
      <p style="margin: 4px 0; font-weight: 600; color: #495057;">Election Page:</p>
      <a href="${electionUrl}" style="color: #007bff; text-decoration: none; word-break: break-all;">${electionUrl}</a>
        </div>
        </div>
`;
exports.default = {
    async sendVoterCredentialsEmail(params) {
        // Prefer Resend if API key available
        if (RESEND_API_KEY) {
            const resend = new resend_1.Resend(RESEND_API_KEY);
            const subject = `You're invited to vote: ${params.electionTitle}`;
            const prettyKey = formatKeyForEmail(params.voterKey);
            const electionUrl = params.electionUrl || params.voteUrl.replace('/vote-page/', '/vote/');
            const html = buildHtml('You are invited to vote', [
                `Hello ${params.voterName || 'Voter'},`,
                `You have been added as a voter for <b>${params.electionTitle}</b>.`,
                `<b>Voter ID:</b> ${params.voterId}<br/><b>Voter Key:</b> <code style="font-family:monospace">${prettyKey}</code>`,
                'Keep your Voter Key secret. It is required to validate your vote.',
            ]) + buildElectionUrlSection(electionUrl, params.voteUrl);
            const text = buildText([
                `Hello ${params.voterName || 'Voter'},`,
                `You have been added as a voter for "${params.electionTitle}".`,
                `Voter ID: ${params.voterId}`,
                `Voter Key: ${prettyKey}`,
                '',
                'Election Access:',
                `Direct Voting Link: ${params.voteUrl}`,
                `Election Page: ${electionUrl}`,
                '',
                'Keep your Voter Key secret. It is required to validate your vote.',
            ]);
            const { data, error } = await resend.emails.send({
                from: RESEND_FROM,
                to: [params.to],
                subject,
                html,
                text,
            });
            if (error)
                throw new Error(error.message || 'Resend send failed');
            return { messageId: data?.id };
        }
        const { transporter, fromEmail } = await getTransporter();
        const subject = `You're invited to vote: ${params.electionTitle}`;
        const prettyKey = formatKeyForEmail(params.voterKey);
        const electionUrl = params.electionUrl || params.voteUrl.replace('/vote-page/', '/vote/');
        const text = buildText([
            `Hello ${params.voterName || 'Voter'},`,
            `You have been added as a voter for "${params.electionTitle}".`,
            `Voter ID: ${params.voterId}`,
            `Voter Key: ${prettyKey}`,
            '',
            'Election Access:',
            `Direct Voting Link: ${params.voteUrl}`,
            `Election Page: ${electionUrl}`,
            '',
            'Keep your Voter Key secret. It is required to validate your vote.',
        ]);
        const html = buildHtml('You are invited to vote', [
            `Hello ${params.voterName || 'Voter'},`,
            `You have been added as a voter for <b>${params.electionTitle}</b>.`,
            `<b>Voter ID:</b> ${params.voterId}<br/><b>Voter Key:</b> <code style="font-family:monospace">${prettyKey}</code>`,
            'Keep your Voter Key secret. It is required to validate your vote.',
        ]) + buildElectionUrlSection(electionUrl, params.voteUrl);
        const info = await transporter.sendMail({
            from: fromEmail,
            to: params.to,
            subject,
            text,
            html,
        });
        if (nodemailer_1.default.getTestMessageUrl(info)) {
            console.log('Ethereal preview URL:', nodemailer_1.default.getTestMessageUrl(info));
        }
        return info;
    },
    async sendVoterVerificationEmail(params) {
        if (RESEND_API_KEY) {
            const resend = new resend_1.Resend(RESEND_API_KEY);
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
            const { data, error } = await (new resend_1.Resend(RESEND_API_KEY)).emails.send({
                from: RESEND_FROM,
                to: [params.voterEmail],
                subject,
                html,
                text,
            });
            if (error)
                throw new Error(error.message || 'Resend send failed');
            return { messageId: data?.id };
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
        if (nodemailer_1.default.getTestMessageUrl(info)) {
            console.log('Ethereal preview URL:', nodemailer_1.default.getTestMessageUrl(info));
        }
        return info;
    },
    async sendVoterStatusUpdateEmail(to, name, electionTitle, status) {
        if (RESEND_API_KEY) {
            const resend = new resend_1.Resend(RESEND_API_KEY);
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
            });
            if (error)
                throw new Error(error.message || 'Resend send failed');
            return { messageId: data?.id };
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
        if (nodemailer_1.default.getTestMessageUrl(info)) {
            console.log('Ethereal preview URL:', nodemailer_1.default.getTestMessageUrl(info));
        }
        return info;
    },
};
