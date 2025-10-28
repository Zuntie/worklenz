import {startDailyDigestJob} from "./daily-digest-job";
import {startNotificationsJob} from "./notifications-job";
import {startProjectDigestJob} from "./project-digest-job";
import {startRecurringTasksJob} from "./recurring-tasks";
import {startDiscordGuildVerificationJob} from "./discord-guild-verification-job";

export function startCronJobs() {
  startNotificationsJob();
  startDailyDigestJob();
  startProjectDigestJob();
  if (process.env.ENABLE_RECURRING_JOBS === "true") startRecurringTasksJob();
  if (process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_GUILD_ID) startDiscordGuildVerificationJob();
}
