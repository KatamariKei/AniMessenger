import { listThreads } from "../server/store.mjs";
import { achievementReviewMetrics } from "../server/achievement-review.mjs";

// Counts only: never print names, transcripts, quotation evidence, or topic labels.
console.log(JSON.stringify(achievementReviewMetrics(await listThreads()), null, 2));
