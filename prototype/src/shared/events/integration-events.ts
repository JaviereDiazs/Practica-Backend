// Contract shared between business modules that talk to each other only
// through the in-process EventEmitter, never by importing one another.
// Producers and consumers of each event live in different modules — see
// plan 03 (messaging → NOTIFICATION_RECEIVED) and plan 06 (jobs →
// JOB_PROGRESS_UPDATED / JOB_COMPLETED), both consumed by the realtime
// gateway in plan 04.

export const INTEGRATION_EVENTS = {
  NOTIFICATION_RECEIVED: 'notification.received',
  JOB_PROGRESS_UPDATED: 'job.progress.updated',
  JOB_COMPLETED: 'job.completed',
} as const;

export interface NotificationReceivedEvent {
  topic: string;
  payload: unknown;
  receivedAt: Date;
}

export interface JobProgressUpdatedEvent {
  jobId: string;
  progress: number;
}

export interface JobCompletedEvent {
  jobId: string;
  result: unknown;
}
