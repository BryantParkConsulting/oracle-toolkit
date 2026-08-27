import React from "react";
import { EvidenceStage, SidePanel } from "../components/EvidenceStage";
import { V2Shell } from "../components/V2Shell";
import { theme } from "../../theme";

export const TokenSafeV2: React.FC = () => (
  <V2Shell
    eyebrow="SECURITY BY DESIGN"
    title="Create the token — then transfer it securely"
  >
    <EvidenceStage
      stillSrc="stills-v2/token-result.png"
      wide
      focuses={[
        {
          x: 16.7,
          y: 53.6,
          width: 21.7,
          height: 8.2,
          start: 4,
          end: 150,
          label: "CENSORED · Token ID and Token Secret",
          color: theme.orange,
        },
      ]}
    />
    <SidePanel kicker="SECURE HANDOFF" accent={theme.orange}>
      <div style={{ fontSize: 42, lineHeight: 1.14, fontWeight: 560 }}>
        Values appear once.
      </div>
      <div
        style={{
          marginTop: 26,
          fontSize: 27,
          lineHeight: 1.48,
          color: theme.muted,
        }}
      >
        They are never shown in the assessment, email, or client-facing video.
      </div>
      <div
        style={{
          marginTop: 38,
          padding: 22,
          borderRadius: 16,
          backgroundColor: theme.orangePale,
          fontSize: 24,
          lineHeight: 1.4,
          color: theme.ink,
        }}
      >
        Use the approved secure transfer channel.
      </div>
    </SidePanel>
  </V2Shell>
);
