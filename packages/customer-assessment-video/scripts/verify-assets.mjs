import { existsSync } from "node:fs";
import { resolve } from "node:path";

const required = [
  "public/audio/voiceover-v2.mp3",
  "public/source/netsuite-token-safe.mp4",
  "public/source/nspb-migration.mp4",
  "public/stills-v2/token-setup.png",
  "public/stills-v2/token-result.png",
  "public/stills-v2/migration-export.png",
  "public/stills-v2/data-job-complete.png",
  "public/stills-v2/current-summary.png",
  "public/stills-v2/current-usage.png",
  "public/stills-v2/netsuite-landscape.png",
  "public/stills-v2/netsuite-recommendations.png",
  "public/stills-v2/performance-footprint.png",
  "public/stills-v2/performance-rules.png",
  "public/stills-v2/cover-current.png",
  "public/stills-v2/cover-performance.png",
  "public/stills-v2/cover-netsuite.png",
];

const missing = required.filter((file) => !existsSync(resolve(file)));

if (missing.length > 0) {
  console.error("Missing local assets:\n");
  for (const file of missing) console.error(`- ${file}`);
  console.error("\nThese files are intentionally excluded from Git.");
  process.exit(1);
}

console.log(`Verified ${required.length} local assets.`);
