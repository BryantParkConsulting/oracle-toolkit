import React from "react";
import { Sequence } from "remotion";
import { EvidenceStage, SidePanel } from "../components/EvidenceStage";
import { StepRail } from "../components/StepRail";
import { V2Shell } from "../components/V2Shell";
import { theme } from "../../theme";

const PrivacyCover: React.FC<{ bottom?: boolean }> = ({ bottom = false }) => (
  <div
    style={{
      position: "absolute",
      left: bottom ? 72 : 72 + 0.143 * 1250,
      top: bottom ? 268 + 0.972 * 703 : 268 + 0.143 * 703,
      width: bottom ? 0.34 * 1250 : 0.64 * 1250,
      height: bottom ? 0.028 * 703 : 0.041 * 703,
      borderRadius: 7,
      background: "linear-gradient(90deg, #dce5e6, #eef3f2)",
      border: `1px solid ${theme.line}`,
      zIndex: 8,
    }}
  />
);

const ProtectedEnvironment: React.FC = () => (
  <>
    <PrivacyCover />
    <PrivacyCover bottom />
  </>
);

export const DeeperEvidenceV2: React.FC = () => (
  <V2Shell
    eyebrow="DEEPER PERFORMANCE EVIDENCE"
    title="Export level-zero data and include the Activity Report"
  >
    <Sequence durationInFrames={243}>
      <EvidenceStage
        stillSrc="stills-v2/data-export-menu.png"
        wide
        focuses={[
          {
            x: 19.1,
            y: 31.3,
            width: 10.3,
            height: 25.6,
            start: 4,
            end: 239,
            label: "Right-click each cube",
            color: theme.sage,
          },
        ]}
      />
      <ProtectedEnvironment />
    </Sequence>
    <Sequence from={243} durationInFrames={97}>
      <EvidenceStage
        stillSrc="stills-v2/data-level-zero.png"
        wide
        focuses={[
          {
            x: 37.6,
            y: 45.6,
            width: 16.8,
            height: 11.4,
            start: 4,
            end: 93,
            label: "Enter a ZIP file name",
            color: theme.gold,
          },
        ]}
      />
      <ProtectedEnvironment />
    </Sequence>
    <Sequence from={340} durationInFrames={90}>
      <EvidenceStage
        stillSrc="stills-v2/data-export-status.png"
        wide
        focuses={[
          {
            x: 39.4,
            y: 46.2,
            width: 13.2,
            height: 10.2,
            start: 4,
            end: 86,
            label: "Wait for the export",
            color: theme.sage,
          },
        ]}
      />
      <ProtectedEnvironment />
    </Sequence>
    <Sequence from={430} durationInFrames={346}>
      <EvidenceStage
        stillSrc="stills-v2/data-download.png"
        wide
        focuses={[
          {
            x: 3.7,
            y: 22.5,
            width: 94.1,
            height: 5.5,
            start: 4,
            end: 342,
            label: "Download each ZIP from Inbox/Outbox",
            color: theme.gold,
          },
        ]}
      />
      <ProtectedEnvironment />
    </Sequence>
    <SidePanel kicker="PERFORMANCE INPUTS" accent={theme.gold}>
      <StepRail
        steps={[
          {
            number: "1",
            title: "Open database properties",
            detail: "Expand Planning and right-click each cube.",
            start: 0,
            end: 243,
          },
          {
            number: "2",
            title: "Export level zero",
            detail: "Choose Export Level Zero Data and name the ZIP.",
            start: 243,
            end: 340,
          },
          {
            number: "3",
            title: "Wait for completion",
            detail: "Confirm the export status before continuing.",
            start: 340,
            end: 430,
          },
          {
            number: "4",
            title: "Download and include activity",
            detail: "Download every ZIP and add the Activity Report.",
            start: 430,
            end: 776,
          },
        ]}
        accent={theme.gold}
      />
    </SidePanel>
  </V2Shell>
);
