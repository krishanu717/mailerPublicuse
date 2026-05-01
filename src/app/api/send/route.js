import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

export async function POST(request) {
  try {
    const { template, subject, recipients, userEmail, appPassword } = await request.json();

    if (!template || !recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return NextResponse.json({ error: 'Missing template or recipients' }, { status: 400 });
    }

    // Use environment variables for credentials, fallback to request body for flexibility during MVP testing
    const emailUser = process.env.GMAIL_USER || userEmail;
    const emailPass = process.env.GMAIL_PASS || appPassword;

    if (!emailUser || !emailPass) {
      return NextResponse.json({ error: 'Missing Gmail credentials. Configure GMAIL_USER and GMAIL_PASS environment variables, or provide them.' }, { status: 400 });
    }

    // Configure Nodemailer transporter
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: emailUser,
        pass: emailPass,
      },
    });

    const results = [];

    // Helper to replace placeholders
    const replacePlaceholders = (text, data) => {
      if (!text) return '';
      return text.replace(/\{\{(.*?)\}\}/g, (match, key) => {
        const trimmedKey = key.trim();
        return data[trimmedKey] !== undefined ? data[trimmedKey] : match;
      });
    };

    // Send emails
    for (const recipient of recipients) {
      // It assumes the recipient data contains an 'Email' or 'email' field
      const recipientEmail = recipient.Email || recipient.email;

      if (!recipientEmail) {
        results.push({ email: 'Unknown', status: 'Failed', reason: 'No Email column found for this row' });
        continue;
      }

      const personalizedSubject = replacePlaceholders(subject, recipient);
      const personalizedBody = replacePlaceholders(template, recipient);

      try {
        await transporter.sendMail({
          from: emailUser,
          to: recipientEmail,
          subject: personalizedSubject,
          text: personalizedBody, // MVP sends as plain text
        });
        results.push({ email: recipientEmail, status: 'Success' });
      } catch (sendError) {
        console.error(`Failed to send to ${recipientEmail}:`, sendError);
        results.push({ email: recipientEmail, status: 'Failed', reason: sendError.message });
      }
    }

    return NextResponse.json({ results }, { status: 200 });
  } catch (error) {
    console.error('Error sending emails:', error);
    return NextResponse.json({ error: 'Internal server error while sending emails' }, { status: 500 });
  }
}
