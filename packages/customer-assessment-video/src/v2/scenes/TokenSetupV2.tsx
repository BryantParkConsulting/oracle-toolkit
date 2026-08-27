import React from "react";
import { EvidenceStage, SidePanel } from "../components/EvidenceStage";
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
      videoFrames={72}
      playbackRate={3}
      wide
      focuses={[
        {
          x: 0.7,
          y: 12.2,
          width: 14.2,
          height: 4.6,
          start: 76,
          end: 145,
          label: "Dedicated integration",
          color: theme.sage,
        },
        {
          x: 1.4,
          y: 40.7,
          width: 14.2,
          height: 6.2,
          start: 140,
          end: 271,
          label: "Enable Token-Based Authentication",
          color: theme.gold,
        },
      ]}
    />
    <SidePanel kicker="CONTROLLED ACCESS">
      <div style={{ fontSize: 38, lineHeight: 1.16, fontWeight: 520 }}>
        Dedicated integration.
        <br />
        Dedicated role.
        <br />
        Read-only permissions.
      </div>
      <div
        style={{
          marginTop: 42,
          fontSize: 25,
          lineHeight: 1.5,
          color: theme.muted,
        }}
      >
        The recording accelerates during navigation, then pauses exactly where
        the required setting is configured.
      </div>
    </SidePanel>
  </V2Shell>
);
