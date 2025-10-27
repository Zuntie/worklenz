import nodemailer from "nodemailer";
import {Validator} from "jsonschema";
import {QueryResult} from "pg";
import {log_error, isValidateEmail} from "./utils";
import emailRequestSchema from "../json_schemas/email-request-schema";
import db from "../config/db";

// Initialize SMTP transporter with configuration from environment variables
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || "587", 10),
  secure: process.env.SMTP_SECURE === "true", // true for 465, false for other ports
  requireTLS: true, // Enforce TLS encryption
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD
  },
  // Optional: Connection timeout and socket timeout
  connectionTimeout: 30000, // 30 seconds
  greetingTimeout: 30000,
  socketTimeout: 60000 // 60 seconds
});

export interface IEmail {
  to?: string[];
  subject: string;
  html: string;
}

export class EmailRequest implements IEmail {
  public readonly html: string;
  public readonly subject: string;
  public readonly to: string[];

  constructor(toEmails: string[], subject: string, content: string) {
    this.to = toEmails;
    this.subject = subject;
    this.html = content;
  }
}

function isValidMailBody(body: IEmail) {
  const validator = new Validator();
  return validator.validate(body, emailRequestSchema).valid;
}

async function removeMails(query: string, emails: string[]) {
  const result: QueryResult<{ email: string; }> = await db.query(query, []);
  const bouncedEmails = result.rows.map(e => e.email);
  for (let i = emails.length - 1; i >= 0; i--) {
    const email = emails[i];
    if (bouncedEmails.includes(email)) {
      emails.splice(i, 1);
    }
  }
}

async function filterSpamEmails(emails: string[]): Promise<void> {
  await removeMails("SELECT email FROM spam_emails ORDER BY email;", emails);
}

async function filterBouncedEmails(emails: string[]): Promise<void> {
  await removeMails("SELECT email FROM bounced_emails ORDER BY email;", emails);
}

export async function sendEmail(email: IEmail): Promise<string | null> {
  try {
    const options = {...email} as IEmail;
    options.to = Array.isArray(options.to) ? Array.from(new Set(options.to)) : [];

    // Filter out empty, null, undefined, and invalid emails
    options.to = options.to
      .filter(email => email && typeof email === 'string' && email.trim().length > 0)
      .map(email => email.trim())
      .filter(email => isValidateEmail(email));

    if (options.to.length) {
      await filterBouncedEmails(options.to);
      await filterSpamEmails(options.to);
    }

    // Double-check that we still have valid emails after filtering
    if (!options.to.length) return null;

    if (!isValidMailBody(options)) return null;

    // Send email using nodemailer with SMTP
    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM || "Worklenz <noreply@worklenz.com>",
      to: options.to.join(", "), // Convert array to comma-separated string
      subject: options.subject,
      html: options.html
    });

    // Return message ID (similar to AWS SES MessageId format)
    return info.messageId || null;
  } catch (e) {
    log_error(e);
  }

  return null;
}
