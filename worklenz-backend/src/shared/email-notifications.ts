import {compileTemplate} from "pug";
import db from "../config/db";
import {IDailyDigest} from "../interfaces/daily-digest";
import {IEmailTemplateType} from "../interfaces/email-template-type";
import {ITaskAssignmentsModel, ITaskAssignmentModelTeam, ITaskAssignmentModelProject} from "../interfaces/task-assignments-model";
import {sendEmail} from "./email";
import FileConstants from "./file-constants";
import {log_error} from "./utils";
import {ITaskMovedToDoneRecord} from "../interfaces/task-moved-to-done";
import {IProjectDigest} from "../interfaces/project-digest";
import {ICommentEmailNotification, IProjectCommentEmailNotification} from "../interfaces/comment-email-notification";
import {
  ITaskAssignmentMetadata,
  IDailyDigestMetadata,
  ITaskDoneMetadata,
  IProjectDigestMetadata,
  ITaskCommentMetadata,
  IProjectCommentMetadata
} from "../interfaces/email-metadata";

async function updateTaskUpdatesStatus(isSent: boolean) {
  try {
    const q = isSent
      ? "DELETE FROM task_updates WHERE is_sent IS TRUE;"
      : "UPDATE task_updates SET is_sent = FALSE;";

    await db.query(q, []);
  } catch (error) {
    log_error(error);
  }
}


async function addToEmailLogs(email: string, subject: string, html: string) {
  try {
    const q = `INSERT INTO email_logs (email, subject, html) VALUES ($1, $2, $3);`;
    await db.query(q, [email, subject, html]);
  } catch (error) {
    log_error(error);
  }
}


export async function sendAssignmentUpdate(toEmail: string, assignment: ITaskAssignmentsModel) {
  try {
    const template = FileConstants.getEmailTemplate(IEmailTemplateType.TaskAssigneeChange) as compileTemplate;

    // Extract metadata from assignment
    let taskCount = 0;
    let assignedBy: string | undefined;

    const teams = (assignment.teams || []).map(team => {
      const projects = (team.projects || []).map(project => {
        const projectTaskCount = project.tasks?.length || 0;
        taskCount += projectTaskCount;

        // Extract assignedBy from first task
        if (!assignedBy && project.tasks && project.tasks.length > 0) {
          assignedBy = project.tasks[0].updater_name;
        }

        return {
          name: project.name || 'Unknown Project',
          taskCount: projectTaskCount
        };
      });

      return {
        name: team.name || 'Unknown Team',
        projects
      };
    });

    const metadata: ITaskAssignmentMetadata = {
      type: IEmailTemplateType.TaskAssigneeChange,
      assignedBy,
      assignedTo: assignment.name || toEmail,
      taskCount,
      teams
    };

    const isSent = assignment.teams?.length
      ? await sendEmail({
        subject: "You have new assignments on Worklenz",
        to: [toEmail],
        html: template(assignment),
        emailType: IEmailTemplateType.TaskAssigneeChange,
        metadata
      })
      : true;

    await updateTaskUpdatesStatus(!!isSent);
    addToEmailLogs(toEmail, "You have new assignments on Worklenz", template(assignment));
  } catch (e) {
    log_error(e);
    await updateTaskUpdatesStatus(false);
  }
}

export async function sendDailyDigest(toEmail: string, digest: IDailyDigest) {
  try {
    const template = FileConstants.getEmailTemplate(IEmailTemplateType.DailyDigest) as compileTemplate;

    // Count tasks in each category
    const countTasks = (teams: ITaskAssignmentModelTeam[] = []): number => {
      return teams.reduce((total: number, team: ITaskAssignmentModelTeam) => {
        return total + (team.projects || []).reduce((sum: number, project: ITaskAssignmentModelProject) => {
          return sum + (project.tasks?.length || 0);
        }, 0);
      }, 0);
    };

    const metadata: IDailyDigestMetadata = {
      type: IEmailTemplateType.DailyDigest,
      userName: digest.name || toEmail,
      newTasksCount: countTasks(digest.recently_assigned),
      overdueTasksCount: countTasks(digest.overdue),
      completedTasksCount: countTasks(digest.recently_completed)
    };

    await sendEmail({
      subject: digest.note as string,
      to: [toEmail],
      html: template(digest),
      emailType: IEmailTemplateType.DailyDigest,
      metadata
    });
  } catch (e) {
    log_error(e);
  }
}

export async function sendTaskDone(toEmails: string[], data: ITaskMovedToDoneRecord) {
  try {
    const template = FileConstants.getEmailTemplate(IEmailTemplateType.TaskDone) as compileTemplate;

    const metadata: ITaskDoneMetadata = {
      type: IEmailTemplateType.TaskDone,
      taskName: data.task.name,
      projectName: data.task.project_name,
      completedBy: data.task.members || 'Unknown'
    };

    await sendEmail({
      subject: data.summary,
      to: toEmails,
      html: template(data),
      emailType: IEmailTemplateType.TaskDone,
      metadata
    });
  } catch (e) {
    log_error(e);
  }
}

export async function sendProjectDailyDigest(toEmail: string, digest: IProjectDigest) {
  try {
    const template = FileConstants.getEmailTemplate(IEmailTemplateType.ProjectDailyDigest) as compileTemplate;

    const metadata: IProjectDigestMetadata = {
      type: IEmailTemplateType.ProjectDailyDigest,
      projectName: digest.name,
      completedTasksCount: digest.today_completed?.length || 0,
      newTasksCount: digest.today_new?.length || 0,
      dueTomorrowCount: digest.due_tomorrow?.length || 0
    };

    await sendEmail({
      subject: digest.summary,
      to: [toEmail],
      html: template(digest),
      emailType: IEmailTemplateType.ProjectDailyDigest,
      metadata
    });
  } catch (e) {
    log_error(e);
  }
}

export async function sendTaskComment(toEmail: string, data: ICommentEmailNotification) {
  try {
    const template = FileConstants.getEmailTemplate(IEmailTemplateType.TaskComment) as compileTemplate;

    // Extract commenter name from greeting (e.g., "Hi John, Sarah commented...")
    const commenterMatch = data.greeting.match(/,\s*([^,]+)\s+commented/i);
    const commenter = commenterMatch ? commenterMatch[1] : 'Someone';

    const metadata: ITaskCommentMetadata = {
      type: IEmailTemplateType.TaskComment,
      commenter,
      taskName: data.task,
      projectName: data.project_name,
      commentPreview: data.comment.substring(0, 200) // First 200 chars
    };

    return await sendEmail({
      subject: data.summary,
      to: [toEmail],
      html: template(data),
      emailType: IEmailTemplateType.TaskComment,
      metadata
    });
  } catch (e) {
    log_error(e);
  }

  return null;
}

export async function sendProjectComment(toEmail: string, data: IProjectCommentEmailNotification) {
  try {
    const template = FileConstants.getEmailTemplate(IEmailTemplateType.ProjectComment) as compileTemplate;

    // Extract commenter name from greeting (e.g., "Hi John, Sarah commented...")
    const commenterMatch = data.greeting.match(/,\s*([^,]+)\s+commented/i);
    const commenter = commenterMatch ? commenterMatch[1] : 'Someone';

    const metadata: IProjectCommentMetadata = {
      type: IEmailTemplateType.ProjectComment,
      commenter,
      projectName: data.project_name,
      commentPreview: data.comment.substring(0, 200) // First 200 chars
    };

    return await sendEmail({
      subject: data.summary,
      to: [toEmail],
      html: template(data),
      emailType: IEmailTemplateType.ProjectComment,
      metadata
    });
  } catch (e) {
    log_error(e);
  }

  return null;
}
