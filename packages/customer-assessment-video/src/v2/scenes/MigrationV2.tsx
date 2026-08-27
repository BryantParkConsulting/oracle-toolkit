import React from "react";
import { EvidenceStage, SidePanel } from "../components/EvidenceStage";
import { V2Shell } from "../components/V2Shell";
import { theme } from "../../theme";

export const MigrationV2: React.FC = () => (
  <V2Shell
    eyebrow="ORACLE NSPB · MIGRATION"
    title="Select the application artifacts and export the snapshot"
  >
    <EvidenceStage
      stillSrc="stills-v2/migration-export.png"
      videoSrc="source/nspb-migration.mp4"
      videoFrames={74}
      playbackRate={4}
      wide
      focuses={[
        {
          x: 22.8,
          y: 13.5,
          width: 54.8,
          height: 30.8,
          start: 78,
          end: 150,
          label: "Selected application artifacts",
          color: theme.sage,
        },
        {
          x: 65.7,
          y: 5.7,
          width: 6.1,
          height: 5.5,
          start: 145,
          end: 215,
          label: "Export",
          color: theme.gold,
        },
      ]}
    />
    <SidePanel kicker="MIGRATION SNAPSHOT">
      <div style={{ fontSize: 33, lineHeight: 1.28, fontWeight: 540 }}>
        Forms, rules, cubes, integrations, security, and application
        configuration.
      </div>
      <div
        style={{
          marginTop: 34,
          fontSize: 25,
          lineHeight: 1.5,
          color: theme.muted,
        }}
      >
        The snapshot provides the structural evidence for the current-state
        review.
      </div>
    </SidePanel>
  </V2Shell>
);
