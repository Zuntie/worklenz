import axios, { AxiosError } from 'axios';
import { log_error } from '../utils';

/**
 * Discord Webhook Service
 * Mirrors outgoing emails to Discord channel for real-time monitoring
 * Non-blocking implementation prevents email delays if webhook fails
 *
 * Features:
 * - HTML to Markdown conversion
 * - Message chunking for Discord 2000-char limit
 * - Rate limiting protection (1s between messages)
 * - Non-blocking error handling
 *
 * @class DiscordWebhookService
 * @singleton
 */
export class DiscordWebhookService {
  private readonly webhookUrl: string;
  private readonly enabled: boolean;
  private readonly DISCORD_CHAR_LIMIT = 2000;
  private readonly RATE_LIMIT_DELAY = 1000; // 1 second between messages

  constructor() {
    this.webhookUrl = process.env.DISCORD_WEBHOOK_URL || '';
    this.enabled = process.env.ENABLE_DISCORD_EMAIL_MIRROR === 'true';
  }

  /**
   * Send email mirror to Discord webhook
   * Non-blocking operation - errors are logged but don't fail email sending
   * Gracefully handles missing webhook URL or disabled mirror
   *
   * @param {string} subject - Email subject line
   * @param {string} html - Email HTML content
   * @param {string[]} recipients - Array of recipient email addresses
   * @returns {Promise<void>}
   */
  public async sendEmailMirror(
    subject: string,
    html: string,
    recipients: string[]
  ): Promise<void> {
    // Early exit if webhook is disabled
    if (!this.enabled || !this.webhookUrl) {
      return;
    }

    try {
      const markdown = this.htmlToMarkdown(html);
      const timestamp = new Date().toISOString();

      const content = this.formatDiscordMessage({
        subject,
        markdown,
        recipients,
        timestamp
      });

      await this.sendToWebhook(content);
    } catch (error) {
      // Don't throw - email already sent via SMTP successfully
      log_error(error);
      console.error('[Discord Webhook] Failed to mirror email:', error instanceof Error ? error.message : error);
    }
  }

  /**
   * Format message for Discord display with structured layout
   *
   * @private
   * @param {Object} params - Message formatting parameters
   * @param {string} params.subject - Email subject
   * @param {string} params.markdown - Email body as markdown
   * @param {string[]} params.recipients - Email recipients
   * @param {string} params.timestamp - ISO timestamp
   * @returns {string} Formatted Discord message
   */
  private formatDiscordMessage(params: {
    subject: string;
    markdown: string;
    recipients: string[];
    timestamp: string;
  }): string {
    const { subject, markdown, recipients, timestamp } = params;

    return `📧 **Email Sent**
**Subject:** ${subject}
**To:** ${recipients.join(', ')}
**Time:** ${timestamp}

${markdown}`;
  }

  /**
   * Convert HTML email to Discord-compatible markdown
   * Removes HTML tags while preserving structure
   * Applies Discord-safe formatting
   *
   * @private
   * @param {string} html - HTML email content
   * @returns {string} Markdown formatted content
   */
  private htmlToMarkdown(html: string): string {
    return html
      // Convert line breaks
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')

      // Convert links
      .replace(/<a\s+href="([^"]+)"[^>]*>([^<]+)<\/a>/gi, '[$2]($1)')

      // Convert bold/italic
      .replace(/<strong>([^<]+)<\/strong>/gi, '**$1**')
      .replace(/<em>([^<]+)<\/em>/gi, '*$1*')

      // Remove all other HTML tags
      .replace(/<\/?[^>]+(>|$)/g, '')

      // Decode HTML entities
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')

      // Trim and limit length (reserve space for header)
      .trim()
      .substring(0, 1500);
  }

  /**
   * Send message to Discord webhook with chunking and rate limiting
   * Handles Discord message size limit and API rate limits
   *
   * @private
   * @param {string} content - Message content to send
   * @returns {Promise<void>}
   * @throws {AxiosError} If webhook request fails after retries
   */
  private async sendToWebhook(content: string): Promise<void> {
    const chunks = this.splitMessage(content, this.DISCORD_CHAR_LIMIT);

    for (const chunk of chunks) {
      try {
        await axios.post(
          this.webhookUrl,
          {
            content: chunk,
            username: 'Worklenz Email Monitor',
            avatar_url: 'https://worklenz.com/favicon.ico'
          },
          {
            timeout: 5000 // 5 second timeout for webhook request
          }
        );

        // Rate limit protection between messages
        if (chunks.length > 1) {
          await this.sleep(this.RATE_LIMIT_DELAY);
        }
      } catch (error) {
        // Log and continue - don't fail on individual chunk failures
        if (error instanceof AxiosError) {
          console.error(`[Discord Webhook] Failed to send chunk: ${error.message} (Status: ${error.response?.status})`);
        } else {
          log_error(error);
        }
      }
    }
  }

  /**
   * Split message into chunks respecting Discord character limit
   * Preserves line breaks for better readability
   *
   * @private
   * @param {string} text - Text to split
   * @param {number} maxLength - Maximum chunk length
   * @returns {string[]} Array of message chunks
   */
  private splitMessage(text: string, maxLength: number): string[] {
    if (text.length <= maxLength) {
      return [text];
    }

    const chunks: string[] = [];
    let currentChunk = '';

    const lines = text.split('\n');

    for (const line of lines) {
      const potentialChunk = currentChunk + line + '\n';

      if (potentialChunk.length > maxLength) {
        if (currentChunk) {
          chunks.push(currentChunk.trim());
          currentChunk = '';
        }

        // Handle very long single lines
        if (line.length > maxLength) {
          chunks.push(line.substring(0, maxLength - 3) + '...');
        } else {
          currentChunk = line + '\n';
        }
      } else {
        currentChunk = potentialChunk;
      }
    }

    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  /**
   * Sleep utility for rate limiting
   *
   * @private
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise<void>}
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Check if webhook is enabled and configured
   *
   * @returns {boolean} True if webhook can send messages
   */
  public isConfigured(): boolean {
    return this.enabled && !!this.webhookUrl;
  }
}

// Singleton instance for application-wide use
export const discordWebhook = new DiscordWebhookService();
