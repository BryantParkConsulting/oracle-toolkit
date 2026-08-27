import React from "react";
import { V2Shell } from "../components/V2Shell";
import { theme } from "../../theme";

export const BusinessImpactV2: React.FC = () => (
  <V2Shell
    eyebrow="FROM TECHNICAL TO FUNCTIONAL"
    title="Every finding is translated into business impact"
  >
    <div
      style={{
        position: "absolute",
        left: 90,
        top: 335,
        width: 610,
        height: 500,
        borderRadius: 28,
        backgroundColor: theme.navyDeep,
        color: theme.white,
        padding: 44,
      }}
    >
      <div
        style={{
          fontSize: 18,
          color: theme.gold,
          letterSpacing: 3.4,
          fontWeight: 900,
        }}
      >
        TECHNICAL FINDING
      </div>
      <div
        style={{
          fontSize: 48,
          lineHeight: 1.12,
          marginTop: 34,
          fontWeight: 480,
        }}
      >
        A stale scenario, slow rule, unused module, or fragile integration.
      </div>
      <div
        style={{
          fontSize: 25,
          lineHeight: 1.45,
          color: "#c9ddd6",
          marginTop: 34,
        }}
      >
        Evidence explains what is happening and why.
      </div>
    </div>
    <div
      style={{
        position: "absolute",
        left: 735,
        top: 545,
        width: 180,
        height: 8,
        backgroundColor: theme.gold,
      }}
    />
    <div
      style={{
        position: "absolute",
        left: 875,
        top: 505,
        fontSize: 70,
        color: theme.gold,
      }}
    >
      →
    </div>
    <div
      style={{
        position: "absolute",
        left: 1010,
        top: 335,
        width: 820,
        height: 500,
        borderRadius: 28,
        backgroundColor: theme.white,
        border: `2px solid ${theme.line}`,
        padding: 44,
        boxShadow: "0 20px 48px rgba(15,40,54,.12)",
      }}
    >
      <div
        style={{
          fontSize: 18,
          color: theme.sage,
          letterSpacing: 3.4,
          fontWeight: 900,
        }}
      >
        FUNCTIONAL CONSEQUENCE
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 20,
          marginTop: 38,
        }}
      >
        <div
          style={{
            padding: 22,
            borderRadius: 16,
            backgroundColor: theme.sagePale,
            fontSize: 29,
          }}
        >
          Faster cycles
        </div>
        <div
          style={{
            padding: 22,
            borderRadius: 16,
            backgroundColor: theme.sagePale,
            fontSize: 29,
          }}
        >
          Reliable reporting
        </div>
        <div
          style={{
            padding: 22,
            borderRadius: 16,
            backgroundColor: theme.goldPale,
            fontSize: 29,
          }}
        >
          Lower maintenance
        </div>
        <div
          style={{
            padding: 22,
            borderRadius: 16,
            backgroundColor: theme.goldPale,
            fontSize: 29,
          }}
        >
          Stronger adoption
        </div>
        <div
          style={{
            padding: 22,
            borderRadius: 16,
            backgroundColor: theme.orangePale,
            fontSize: 29,
          }}
        >
          Clear governance
        </div>
        <div
          style={{
            padding: 22,
            borderRadius: 16,
            backgroundColor: theme.orangePale,
            fontSize: 29,
          }}
        >
          Planning flexibility
        </div>
      </div>
    </div>
  </V2Shell>
);
