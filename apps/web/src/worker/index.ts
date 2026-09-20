import { Queue, Worker } from "bullmq";
import { reconcileArticleUsage } from "./jobs/reconcile-articles";
import { logger } from "../lib/logger";

const connection = { url: process.env.REDIS_URL ?? "redis://localhost:6379" };

const queueName = "maintenance";
const queue = new Queue(queueName, { connection });

async function scheduleRepeatableJobs() {
  // Orders no longer roll over by the clock: staff press Start / End. Drop the old scheduler
  // so a previous deployment's repeatable job doesn't keep firing with no handler.
  await queue.removeJobScheduler("roll-order-status");
  await queue.upsertJobScheduler(
    "reconcile-articles",
    { pattern: "0 3 * * *" }, // 3am daily
    { name: "reconcile-articles", data: {} }
  );
}

const worker = new Worker(
  queueName,
  async (job) => {
    switch (job.name) {
      case "reconcile-articles":
        return reconcileArticleUsage();
      default:
        logger.warn({ jobName: job.name }, "worker: unknown job");
    }
  },
  { connection }
);

worker.on("completed", (job, result) => {
  logger.info({ jobName: job.name, result }, "worker job completed");
});
worker.on("failed", (job, err) => {
  logger.error({ jobName: job?.name, err }, "worker job failed");
});

scheduleRepeatableJobs()
  .then(() => logger.info("worker: scheduled repeatable jobs, listening..."))
  .catch((err) => {
    logger.error({ err }, "worker: failed to schedule jobs");
    process.exit(1);
  });
