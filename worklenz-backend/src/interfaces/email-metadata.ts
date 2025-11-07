/**
 * Email Metadata Interfaces
 * Used for Discord webhook notifications with structured data
 * Each email type has its own metadata interface with relevant fields
 */

import { IEmailTemplateType } from "./email-template-type";

/**
 * Base interface for all email metadata
 */
export interface IEmailMetadata {
  type: IEmailTemplateType;
  timestamp?: string;
}

/**
 * Welcome email metadata
 */
export interface IWelcomeEmailMetadata extends IEmailMetadata {
  type: IEmailTemplateType.Welcome;
  userName: string;
}

/**
 * Team invitation metadata (existing user)
 */
export interface ITeamInvitationMetadata extends IEmailMetadata {
  type: IEmailTemplateType.TeamMemberInvitation;
  invitedBy: string;
  invitedUser: string;
  teamName: string;
  projectName?: string;
}

/**
 * Team invitation metadata (unregistered user)
 */
export interface IUnregisteredTeamInvitationMetadata extends IEmailMetadata {
  type: IEmailTemplateType.UnregisteredTeamMemberInvitation;
  invitedBy: string;
  invitedEmail: string;
  teamName: string;
  projectName?: string;
}

/**
 * Password reset email metadata
 */
export interface IPasswordResetMetadata extends IEmailMetadata {
  type: IEmailTemplateType.ResetPassword;
  userEmail: string;
}

/**
 * Password changed confirmation metadata
 */
export interface IPasswordChangedMetadata extends IEmailMetadata {
  type: IEmailTemplateType.PasswordChange;
  userEmail: string;
}

/**
 * Task assignment change metadata
 */
export interface ITaskAssignmentMetadata extends IEmailMetadata {
  type: IEmailTemplateType.TaskAssigneeChange;
  assignedBy?: string;
  assignedTo: string;
  taskCount: number;
  teams: Array<{
    name: string;
    projects: Array<{
      name: string;
      taskCount: number;
    }>;
  }>;
}

/**
 * Daily digest metadata
 */
export interface IDailyDigestMetadata extends IEmailMetadata {
  type: IEmailTemplateType.DailyDigest;
  userName: string;
  newTasksCount: number;
  overdueTasksCount: number;
  completedTasksCount: number;
}

/**
 * Task completion metadata
 */
export interface ITaskDoneMetadata extends IEmailMetadata {
  type: IEmailTemplateType.TaskDone;
  taskName: string;
  projectName: string;
  completedBy: string;
}

/**
 * Project daily digest metadata
 */
export interface IProjectDigestMetadata extends IEmailMetadata {
  type: IEmailTemplateType.ProjectDailyDigest;
  projectName: string;
  completedTasksCount: number;
  newTasksCount: number;
  dueTomorrowCount: number;
}

/**
 * Task comment metadata
 */
export interface ITaskCommentMetadata extends IEmailMetadata {
  type: IEmailTemplateType.TaskComment;
  commenter: string;
  taskName: string;
  projectName: string;
  commentPreview: string;
}

/**
 * Project comment metadata
 */
export interface IProjectCommentMetadata extends IEmailMetadata {
  type: IEmailTemplateType.ProjectComment;
  commenter: string;
  projectName: string;
  commentPreview: string;
}

/**
 * Union type of all possible email metadata
 */
export type EmailMetadata =
  | IWelcomeEmailMetadata
  | ITeamInvitationMetadata
  | IUnregisteredTeamInvitationMetadata
  | IPasswordResetMetadata
  | IPasswordChangedMetadata
  | ITaskAssignmentMetadata
  | IDailyDigestMetadata
  | ITaskDoneMetadata
  | IProjectDigestMetadata
  | ITaskCommentMetadata
  | IProjectCommentMetadata;
