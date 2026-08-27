import React from "react";
import { Sequence } from "remotion";
import { EvidenceStage, PortraitSidePanel } from "../components/EvidenceStage";
import { V2Shell } from "../components/V2Shell";
import { theme } from "../../theme";

export const PerformanceV2: React.FC = () => (
  <V2Shell
    eyebrow="NSPB PERFORMANCE REVIEW"
    title="Find the design choices that create unnecessary cost and delay"
  >
    <Sequence durationInFrames={150}>
      <EvidenceStage
        stillSrc="stills-v2/performance-footprint.png"
        focuses={[
          {
            x: 18.5,
            y: 34.5,
            width: 60,
            height: 30,
            start: 5,
            end: 149,
            label: "Stale data and cleanup opportunity",
            color: theme.sage,
          },
        ]}
      />
    </Sequence>
    <Sequence from={150} durationInFrames={153}>
      <EvidenceStage
        stillSrc="stills-v2/performance-rules.png"
        focuses={[
          {
            x: 18.4,
            y: 30.5,
            width: 60.2,
            height: 56.5,
            start: 2,
            end: 152,
            label: "Slow calculations and outliers",
            color: theme.orange,
          },
        ]}
      />
    </Sequence>
    <PortraitSidePanel kicker="WHAT WE TEST">
      <div style={{ fontSize: 31, lineHeight: 1.5 }}>
        Stale scenarios
        <br />
        Data footprint
        <br />
        Calculation duration
        <br />
        Rule quality
        <br />
        Navigation and forms
        <br />
        Integration flows
      </div>
      <div
        style={{
          marginTop: 34,
          padding: 22,
          borderRadius: 16,
          backgroundColor: theme.goldPale,
          fontSize: 25,
          lineHeight: 1.4,
        }}
      >
        The view changes only when the narration changes from footprint to
        calculation speed.
      </div>
    </PortraitSidePanel>
  </V2Shell>
);
