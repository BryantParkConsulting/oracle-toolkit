import React from "react";
import { Sequence } from "remotion";
import { EvidenceStage, SidePanel } from "../components/EvidenceStage";
import { StepRail } from "../components/StepRail";
import { V2Shell } from "../components/V2Shell";
import { theme } from "../../theme";

const PrivacyCover: React.FC<{
  x: number;
  y: number;
  width: number;
  height: number;
}> = ({ x, y, width, height }) => (
  <div
    style={{
      position: "absolute",
      left: 72 + (x / 100) * 1250,
      top: 268 + (y / 100) * 703,
      width: (width / 100) * 1250,
      height: (height / 100) * 703,
      borderRadius: 8,
      background: "linear-gradient(90deg, #dce5e6, #eef3f2)",
      border: `1px solid ${theme.line}`,
      zIndex: 8,
    }}
  />
);

export const MigrationV2: React.FC = () => (
  <V2Shell
    eyebrow="ORACLE NSPB · MIGRATION"
    title="Select, export, verify, and download the Migration snapshot"
  >
    <Sequence durationInFrames={150}>
      <EvidenceStage
        stillSrc="stills-v2/migration-categories.png"
        wide
        focuses={[
          {
            x: 0.3,
            y: 12.5,
            width: 99.2,
            height: 22.2,
            start: 4,
            end: 146,
            label: "Select the required artifacts",
            color: theme.sage,
          },
        ]}
      />
    </Sequence>
    <Sequence from={150} durationInFrames={150}>
      <EvidenceStage
        stillSrc="stills-v2/migration-name.png"
        wide
        focuses={[
          {
            x: 37.8,
            y: 42.3,
            width: 24.4,
            height: 15.4,
            start: 4,
            end: 146,
            label: "Give the snapshot a clear name",
            color: theme.gold,
          },
        ]}
      />
    </Sequence>
    <Sequence from={300} durationInFrames={120}>
      <EvidenceStage
        stillSrc="stills-v2/migration-complete.png"
        wide
        focuses={[
          {
            x: 62.2,
            y: 18.2,
            width: 9.8,
            height: 5.8,
            start: 4,
            end: 116,
            label: "Wait for Completed",
            color: theme.sage,
          },
        ]}
      />
      <PrivacyCover x={22.8} y={13.5} width={16.5} height={3.6} />
    </Sequence>
    <Sequence from={420} durationInFrames={107}>
      <EvidenceStage
        stillSrc="stills-v2/migration-download.png"
        wide
        focuses={[
          {
            x: 88.2,
            y: 19.2,
            width: 9.6,
            height: 19.7,
            start: 4,
            end: 103,
            label: "Download the ZIP",
            color: theme.gold,
            labelAlign: "right",
          },
        ]}
      />
    </Sequence>
    <SidePanel kicker="MIGRATION SNAPSHOT">
      <StepRail
        steps={[
          {
            number: "1",
            title: "Open Migration",
            detail: "Select the application artifacts required for review.",
            start: 0,
            end: 150,
          },
          {
            number: "2",
            title: "Export and name",
            detail: "Use a clear snapshot name the client can identify.",
            start: 150,
            end: 300,
          },
          {
            number: "3",
            title: "Verify completion",
            detail: "Wait for the Migration Status Report to show Completed.",
            start: 300,
            end: 420,
          },
          {
            number: "4",
            title: "Download the ZIP",
            detail: "Keep the exported folder structure unchanged.",
            start: 420,
            end: 527,
          },
        ]}
        accent={theme.sage}
      />
    </SidePanel>
  </V2Shell>
);
