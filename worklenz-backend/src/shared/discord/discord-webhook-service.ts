import axios, { AxiosError } from 'axios';
import { log_error } from '../utils';
import { IEmailTemplateType } from '../../interfaces/email-template-type';
import {
  EmailMetadata,
  IWelcomeEmailMetadata,
  ITeamInvitationMetadata,
  IUnregisteredTeamInvitationMetadata,
  IPasswordResetMetadata,
  IPasswordChangedMetadata,
  ITaskAssignmentMetadata,
  IDailyDigestMetadata,
  ITaskDoneMetadata,
  IProjectDigestMetadata,
  ITaskCommentMetadata,
  IProjectCommentMetadata
} from '../../interfaces/email-metadata';

/**
 * Discord Webhook Service
 * Sends rich embeds to Discord for email monitoring
 * Each email type has custom formatting with relevant details
 *
 * Features:
 * - Rich Discord Embeds (colored, structured)
 * - Type-specific formatters for each email type
 * - Rate limiting protection
 * - Non-blocking error handling
 *
 * @class DiscordWebhookService
 * @singleton
 */

/**
 * Discord Embed structure
 */
interface DiscordEmbed {
  title?: string;
  description?: string;
  color?: number;
  fields?: Array<{
    name: string;
    value: string;
    inline?: boolean;
  }>;
  footer?: {
    text: string;
    icon_url?: string;
  };
  timestamp?: string;
  thumbnail?: {
    url: string;
  };
}

interface DiscordWebhookPayload {
  username?: string;
  avatar_url?: string;
  embeds: DiscordEmbed[];
}

/**
 * Color scheme for different email categories
 * Using Discord-friendly hex colors converted to decimal
 */
const EMBED_COLORS = {
  // Authentication & User Management (Blue tones)
  AUTH: 0x3498db,        // Bright Blue
  SECURITY: 0xe74c3c,    // Red

  // Team & Invitations (Orange tones)
  INVITATION: 0xe67e22,  // Orange

  // Tasks (Green tones)
  TASK: 0x2ecc71,        // Green
  TASK_DONE: 0x27ae60,   // Dark Green

  // Comments (Purple tones)
  COMMENT: 0x9b59b6,     // Purple

  // Digests & Reports (Blue-gray tones)
  DIGEST: 0x34495e,      // Dark Blue-Gray

  // Default
  DEFAULT: 0x95a5a6      // Gray
} as const;

/**
 * Emoji icons for different email types
 */
const EMOJI_ICONS = {
  WELCOME: '👋',
  INVITATION: '👥',
  PASSWORD: '🔐',
  TASK: '📋',
  TASK_DONE: '✅',
  COMMENT: '💬',
  DIGEST: '📊',
  PROJECT: '📁'
} as const;

export class DiscordWebhookService {
  private readonly webhookUrl: string;
  private readonly enabled: boolean;
  private readonly RATE_LIMIT_DELAY = 1000; // 1 second between embeds

  constructor() {
    this.webhookUrl = process.env.DISCORD_WEBHOOK_URL || '';
    this.enabled = process.env.ENABLE_DISCORD_EMAIL_MIRROR === 'true';
  }

  /**
   * Send email notification to Discord webhook as rich embed
   * Non-blocking operation - errors are logged but don't fail email sending
   *
   * @param {EmailMetadata | null} metadata - Structured email metadata
   * @param {string[]} recipients - Array of recipient email addresses
   * @returns {Promise<void>}
   */
  public async sendEmailNotification(
    metadata: EmailMetadata | null,
    recipients: string[]
  ): Promise<void> {
    // Early exit if webhook is disabled or metadata is missing
    if (!this.enabled || !this.webhookUrl || !metadata) {
      return;
    }

    try {
      const embed = this.buildEmbed(metadata, recipients);
      await this.sendToWebhook({ embeds: [embed] });
    } catch (error) {
      // Don't throw - email already sent via SMTP successfully
      log_error(error);
      console.error(
        '[Discord Webhook] Failed to send notification:',
        error instanceof Error ? error.message : error
      );
    }
  }

  /**
   * Build Discord embed based on email type
   *
   * @private
   * @param {EmailMetadata} metadata - Email metadata
   * @param {string[]} recipients - Email recipients
   * @returns {DiscordEmbed}
   */
  private buildEmbed(metadata: EmailMetadata, recipients: string[]): DiscordEmbed {
    const timestamp = metadata.timestamp || new Date().toISOString();

    // Route to type-specific formatter
    switch (metadata.type) {
      case IEmailTemplateType.Welcome:
        return this.buildWelcomeEmbed(metadata as IWelcomeEmailMetadata, recipients, timestamp);

      case IEmailTemplateType.TeamMemberInvitation:
        return this.buildTeamInvitationEmbed(metadata as ITeamInvitationMetadata, recipients, timestamp);

      case IEmailTemplateType.UnregisteredTeamMemberInvitation:
        return this.buildUnregisteredInvitationEmbed(metadata as IUnregisteredTeamInvitationMetadata, recipients, timestamp);

      case IEmailTemplateType.ResetPassword:
        return this.buildPasswordResetEmbed(metadata as IPasswordResetMetadata, recipients, timestamp);

      case IEmailTemplateType.PasswordChange:
        return this.buildPasswordChangedEmbed(metadata as IPasswordChangedMetadata, recipients, timestamp);

      case IEmailTemplateType.TaskAssigneeChange:
        return this.buildTaskAssignmentEmbed(metadata as ITaskAssignmentMetadata, recipients, timestamp);

      case IEmailTemplateType.DailyDigest:
        return this.buildDailyDigestEmbed(metadata as IDailyDigestMetadata, recipients, timestamp);

      case IEmailTemplateType.TaskDone:
        return this.buildTaskDoneEmbed(metadata as ITaskDoneMetadata, recipients, timestamp);

      case IEmailTemplateType.ProjectDailyDigest:
        return this.buildProjectDigestEmbed(metadata as IProjectDigestMetadata, recipients, timestamp);

      case IEmailTemplateType.TaskComment:
        return this.buildTaskCommentEmbed(metadata as ITaskCommentMetadata, recipients, timestamp);

      case IEmailTemplateType.ProjectComment:
        return this.buildProjectCommentEmbed(metadata as IProjectCommentMetadata, recipients, timestamp);

      default:
        return this.buildDefaultEmbed(metadata, recipients, timestamp);
    }
  }

  /**
   * Welcome email embed
   */
  private buildWelcomeEmbed(
    metadata: IWelcomeEmailMetadata,
    recipients: string[],
    timestamp: string
  ): DiscordEmbed {
    return {
      title: `${EMOJI_ICONS.WELCOME} New User Registration`,
      color: EMBED_COLORS.AUTH,
      fields: [
        { name: 'User', value: metadata.userName, inline: true },
        { name: 'Email', value: recipients[0], inline: true }
      ],
      footer: { text: 'Worklenz Email Monitor' },
      timestamp
    };
  }

  /**
   * Team invitation embed (existing user)
   */
  private buildTeamInvitationEmbed(
    metadata: ITeamInvitationMetadata,
    recipients: string[],
    timestamp: string
  ): DiscordEmbed {
    const fields: DiscordEmbed['fields'] = [
      { name: 'Invited By', value: metadata.invitedBy, inline: true },
      { name: 'Invited User', value: metadata.invitedUser, inline: true },
      { name: 'Team', value: metadata.teamName, inline: false }
    ];

    if (metadata.projectName) {
      fields.push({ name: 'Project', value: metadata.projectName, inline: false });
    }

    return {
      title: `${EMOJI_ICONS.INVITATION} Team Invitation`,
      description: `${metadata.invitedBy} invited ${metadata.invitedUser} to join **${metadata.teamName}**`,
      color: EMBED_COLORS.INVITATION,
      fields,
      footer: { text: 'Worklenz Email Monitor' },
      timestamp
    };
  }

  /**
   * Team invitation embed (unregistered user)
   */
  private buildUnregisteredInvitationEmbed(
    metadata: IUnregisteredTeamInvitationMetadata,
    recipients: string[],
    timestamp: string
  ): DiscordEmbed {
    const fields: DiscordEmbed['fields'] = [
      { name: 'Invited By', value: metadata.invitedBy, inline: true },
      { name: 'Email', value: metadata.invitedEmail, inline: true },
      { name: 'Team', value: metadata.teamName, inline: false }
    ];

    if (metadata.projectName) {
      fields.push({ name: 'Project', value: metadata.projectName, inline: false });
    }

    return {
      title: `${EMOJI_ICONS.INVITATION} Team Invitation (New User)`,
      description: `${metadata.invitedBy} invited **${metadata.invitedEmail}** to register and join **${metadata.teamName}**`,
      color: EMBED_COLORS.INVITATION,
      fields,
      footer: { text: 'Worklenz Email Monitor' },
      timestamp
    };
  }

  /**
   * Password reset embed
   */
  private buildPasswordResetEmbed(
    metadata: IPasswordResetMetadata,
    recipients: string[],
    timestamp: string
  ): DiscordEmbed {
    return {
      title: `${EMOJI_ICONS.PASSWORD} Password Reset Requested`,
      color: EMBED_COLORS.SECURITY,
      fields: [
        { name: 'User Email', value: metadata.userEmail, inline: false }
      ],
      footer: { text: 'Worklenz Email Monitor' },
      timestamp
    };
  }

  /**
   * Password changed confirmation embed
   */
  private buildPasswordChangedEmbed(
    metadata: IPasswordChangedMetadata,
    recipients: string[],
    timestamp: string
  ): DiscordEmbed {
    return {
      title: `${EMOJI_ICONS.PASSWORD} Password Changed`,
      color: EMBED_COLORS.AUTH,
      fields: [
        { name: 'User Email', value: metadata.userEmail, inline: false }
      ],
      footer: { text: 'Worklenz Email Monitor' },
      timestamp
    };
  }

  /**
   * Task assignment embed
   */
  private buildTaskAssignmentEmbed(
    metadata: ITaskAssignmentMetadata,
    recipients: string[],
    timestamp: string
  ): DiscordEmbed {
    const fields: DiscordEmbed['fields'] = [
      { name: 'Assigned To', value: metadata.assignedTo, inline: true },
      { name: 'Total Tasks', value: metadata.taskCount.toString(), inline: true }
    ];

    if (metadata.assignedBy) {
      fields.unshift({ name: 'Assigned By', value: metadata.assignedBy, inline: true });
    }

    // Add team/project breakdown
    if (metadata.teams && metadata.teams.length > 0) {
      const breakdown = metadata.teams.map(team => {
        const projectList = team.projects
          .map(p => `  • ${p.name} (${p.taskCount} task${p.taskCount > 1 ? 's' : ''})`)
          .join('\n');
        return `**${team.name}**\n${projectList}`;
      }).join('\n\n');

      fields.push({ name: 'Breakdown', value: breakdown, inline: false });
    }

    return {
      title: `${EMOJI_ICONS.TASK} Task Assignment`,
      color: EMBED_COLORS.TASK,
      fields,
      footer: { text: 'Worklenz Email Monitor' },
      timestamp
    };
  }

  /**
   * Daily digest embed
   */
  private buildDailyDigestEmbed(
    metadata: IDailyDigestMetadata,
    recipients: string[],
    timestamp: string
  ): DiscordEmbed {
    return {
      title: `${EMOJI_ICONS.DIGEST} Daily Digest`,
      description: `Summary for **${metadata.userName}**`,
      color: EMBED_COLORS.DIGEST,
      fields: [
        { name: 'New Tasks', value: metadata.newTasksCount.toString(), inline: true },
        { name: 'Overdue', value: metadata.overdueTasksCount.toString(), inline: true },
        { name: 'Completed', value: metadata.completedTasksCount.toString(), inline: true }
      ],
      footer: { text: 'Worklenz Email Monitor' },
      timestamp
    };
  }

  /**
   * Task completion embed
   */
  private buildTaskDoneEmbed(
    metadata: ITaskDoneMetadata,
    recipients: string[],
    timestamp: string
  ): DiscordEmbed {
    return {
      title: `${EMOJI_ICONS.TASK_DONE} Task Completed`,
      description: `**${metadata.taskName}** was marked as done`,
      color: EMBED_COLORS.TASK_DONE,
      fields: [
        { name: 'Task', value: metadata.taskName, inline: false },
        { name: 'Project', value: metadata.projectName, inline: true },
        { name: 'Completed By', value: metadata.completedBy, inline: true }
      ],
      footer: { text: 'Worklenz Email Monitor' },
      timestamp
    };
  }

  /**
   * Project daily digest embed
   */
  private buildProjectDigestEmbed(
    metadata: IProjectDigestMetadata,
    recipients: string[],
    timestamp: string
  ): DiscordEmbed {
    return {
      title: `${EMOJI_ICONS.PROJECT} Project Daily Digest`,
      description: `Summary for **${metadata.projectName}**`,
      color: EMBED_COLORS.DIGEST,
      fields: [
        { name: 'Completed Today', value: metadata.completedTasksCount.toString(), inline: true },
        { name: 'New Tasks', value: metadata.newTasksCount.toString(), inline: true },
        { name: 'Due Tomorrow', value: metadata.dueTomorrowCount.toString(), inline: true }
      ],
      footer: { text: 'Worklenz Email Monitor' },
      timestamp
    };
  }

  /**
   * Task comment embed
   */
  private buildTaskCommentEmbed(
    metadata: ITaskCommentMetadata,
    recipients: string[],
    timestamp: string
  ): DiscordEmbed {
    return {
      title: `${EMOJI_ICONS.COMMENT} Task Comment`,
      description: metadata.commentPreview,
      color: EMBED_COLORS.COMMENT,
      fields: [
        { name: 'Commenter', value: metadata.commenter, inline: true },
        { name: 'Task', value: metadata.taskName, inline: true },
        { name: 'Project', value: metadata.projectName, inline: false }
      ],
      footer: { text: 'Worklenz Email Monitor' },
      timestamp
    };
  }

  /**
   * Project comment embed
   */
  private buildProjectCommentEmbed(
    metadata: IProjectCommentMetadata,
    recipients: string[],
    timestamp: string
  ): DiscordEmbed {
    return {
      title: `${EMOJI_ICONS.COMMENT} Project Comment`,
      description: metadata.commentPreview,
      color: EMBED_COLORS.COMMENT,
      fields: [
        { name: 'Commenter', value: metadata.commenter, inline: true },
        { name: 'Project', value: metadata.projectName, inline: true }
      ],
      footer: { text: 'Worklenz Email Monitor' },
      timestamp
    };
  }

  /**
   * Default/fallback embed for unknown types
   */
  private buildDefaultEmbed(
    metadata: EmailMetadata,
    recipients: string[],
    timestamp: string
  ): DiscordEmbed {
    return {
      title: '📧 Email Sent',
      color: EMBED_COLORS.DEFAULT,
      fields: [
        { name: 'Type', value: metadata.type.toString(), inline: true },
        { name: 'Recipients', value: recipients.join(', '), inline: false }
      ],
      footer: { text: 'Worklenz Email Monitor' },
      timestamp
    };
  }

  /**
   * Send embed to Discord webhook
   *
   * @private
   * @param {DiscordWebhookPayload} payload - Webhook payload with embeds
   * @returns {Promise<void>}
   */
  private async sendToWebhook(payload: DiscordWebhookPayload): Promise<void> {
    try {
      await axios.post(
        this.webhookUrl,
        {
          username: 'Worklenz Email Monitor',
          avatar_url: 'https://worklenz.com/favicon.ico',
          ...payload
        },
        {
          timeout: 5000 // 5 second timeout
        }
      );
    } catch (error) {
      if (error instanceof AxiosError) {
        console.error(
          `[Discord Webhook] Failed to send embed: ${error.message} (Status: ${error.response?.status})`
        );
      } else {
        log_error(error);
      }
    }
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
