import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const groups = {
  "data-guide": [
    "public/audio/data-preparation-guide.mp3",
    "public/stills-v4/ns-consumer.png",
    "public/stills-v4/ns-token-form-43.png",
    "public/stills-v4/ns-token-confirm.png",
    "public/stills-v2/migration-categories.png",
    "public/stills-v2/migration-complete.png",
    "public/stills-v2/migration-download.png",
    "public/stills-v2/data-export-menu.png",
    "public/stills-v2/data-level-zero.png",
    "public/stills-v2/data-export-status.png",
    "public/stills-v2/data-download.png",
  ],
  overview: [
    "public/audio/assessment-overview.mp3",
    "public/stills-v2/current-summary.png",
    "public/stills-v2/current-usage.png",
    "public/stills-v2/netsuite-landscape.png",
    "public/stills-v2/netsuite-recommendations.png",
    "public/stills-v2/performance-footprint.png",
    "public/stills-v2/performance-rules.png",
    "public/stills-v2/cover-current.png",
    "public/stills-v2/cover-performance.png",
    "public/stills-v2/cover-netsuite.png",
  ],
};

const mode = process.argv[2] ?? "all";
if (!["data-guide", "overview", "all"].includes(mode)) {
  console.error(`Unknown asset group: ${mode}`);
  console.error("Use data-guide, overview, or all.");
  process.exit(2);
}

const required = mode === "all" ? [...groups["data-guide"], ...groups.overview] : groups[mode];
const missing = required.filter((file) => !existsSync(resolve(projectRoot, file)));

if (missing.length > 0) {
  console.error(`Missing local assets for ${mode}:\n`);
  for (const file of missing) console.error(`- ${file}`);
  console.error("\nThese files are intentionally excluded from Git.");
  process.exit(1);
}

console.log(`Verified ${required.length} local assets for ${mode}.`);
