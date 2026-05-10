import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getToken } from 'next-auth/jwt';

// Helper to encode to base64url format
function encodeMessage(to, subject, body) {
  const str = [
    'Content-Type: text/plain; charset="UTF-8"\n',
    'MIME-Version: 1.0\n',
    'Content-Transfer-Encoding: 7bit\n',
    `To: ${to}\n`,
    `Subject: ${subject}\n\n`,
    body
  ].join('');
  return Buffer.from(str).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function POST(req) {
  try {
    // Retrieve the NextAuth token to get the Google access token
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token || !token.accessToken) {
      return NextResponse.json({ error: 'Unauthorized: Please sign in with Google' }, { status: 401 });
    }

    const { template, subject, recipients, emailColumn } = await req.json();

    if (!template || !recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return NextResponse.json({ error: 'Missing template or recipients' }, { status: 400 });
    }

    // Safety limit constraint
    if (recipients.length > 50) {
      return NextResponse.json({ error: 'Safety Limit Exceeded: Max 50 emails per request' }, { status: 400 });
    }

    // Initialize the Gmail API client
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: token.accessToken });
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    const results = [];

    const replacePlaceholders = (text, data) => {
      if (!text) return '';
      return text.replace(/\{\{(.*?)\}\}/g, (match, key) => {
        const trimmedKey = key.trim();
        return data[trimmedKey] !== undefined ? data[trimmedKey] : match;
      });
    };

    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    for (const recipient of recipients) {
      // Use dynamic email column if provided, otherwise fallback to common names
      const recipientEmail = emailColumn ? recipient[emailColumn] : (recipient.Email || recipient.email);
      if (!recipientEmail) {
        results.push({ email: 'Unknown', status: 'Failed', reason: 'No valid Email column mapped' });
        continue;
      }

      const personalizedSubject = replacePlaceholders(subject, recipient);
      const personalizedBody = replacePlaceholders(template, recipient);

      try {
        const rawMessage = encodeMessage(recipientEmail, personalizedSubject, personalizedBody);
        
        await gmail.users.messages.send({
          userId: 'me',
          requestBody: {
            raw: rawMessage,
          },
        });
        
        results.push({ email: recipientEmail, status: 'Success' });
        
        // Apply 1.5 seconds delay between sends
        await delay(1500);

      } catch (error) {
        console.error(`Failed to send to ${recipientEmail}:`, error);
        results.push({ email: recipientEmail, status: 'Failed', reason: error.message });
      }
    }

    return NextResponse.json({ results }, { status: 200 });

  } catch (error) {
    console.error('Error in send API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
