import React from "react";
import { EvidenceStage, SidePanel } from "../components/EvidenceStage";
import { StepRail } from "../components/StepRail";
import { V2Shell } from "../components/V2Shell";
import { theme } from "../../theme";

export const TokenSetupV2: React.FC = () => (
  <V2Shell
    eyebrow="NETSUITE · READ-ONLY ACCESS"
    title="Create a dedicated token-based integration"
  >
    <EvidenceStage
      stillSrc="stills-v2/token-setup.png"
      videoSrc="source/netsuite-token-safe.mp4"
      videoFrames={170}
      playbackRate={1.5}
      wide
      focuses={[
        {
          x: 0.7,
          y: 12.2,
          width: 14.2,
          height: 4.6,
          start: 176,
          end: 235,
          label: "Dedicated integration",
          color: theme.sage,
        },
        {
          x: 1.4,
          y: 40.7,
          width: 14.2,
          height: 6.2,
          start: 228,
          end: 323,
          label: "Enable Token-Based Authentication",
          color: theme.gold,
        },
      ]}
    />
    <SidePanel kicker="NETSUITE SETUP">
      <StepRail
        steps={[
          {
            number: "1",
            title: "Open the integration",
            detail: "Setup → Integrations → Manage Integrations → New",
            start: 0,
            end: 180,
          },
          {
            number: "2",
            title: "Configure and save",
            detail:
              "Name it, keep it Enabled, and select Token-Based Authentication.",
            start: 180,
            end: 323,
          },
        ]}
      />
    </SidePanel>
  </V2Shell>
);
