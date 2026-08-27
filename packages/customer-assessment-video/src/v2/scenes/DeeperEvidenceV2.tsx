import React from "react";
import { Img, staticFile } from "remotion";
import { V2Shell } from "../components/V2Shell";
import { theme } from "../../theme";

export const DeeperEvidenceV2: React.FC = () => (
  <V2Shell
    eyebrow="OPTIONAL DEEPER EVIDENCE"
    title="Add data and activity only when deeper performance analysis is needed"
  >
    <div
      style={{
        position: "absolute",
        left: 84,
        top: 310,
        width: 1050,
        height: 590,
        backgroundColor: theme.white,
        border: `2px solid ${theme.line}`,
        borderRadius: 24,
        overflow: "hidden",
        boxShadow: "0 20px 48px rgba(15,40,54,.13)",
      }}
    >
      <Img
        src={staticFile("stills-v2/data-job-complete.png")}
        style={{ width: "100%", height: "100%" }}
      />
      <div
        style={{
          position: "absolute",
          left: "38.5%",
          top: "45%",
          width: "14%",
          height: "12%",
          border: `5px solid ${theme.gold}`,
          borderRadius: 12,
          boxShadow: "0 0 0 9999px rgba(15,40,54,.12)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: "38.5%",
          top: "38%",
          backgroundColor: theme.gold,
          padding: "8px 14px",
          borderRadius: "9px 9px 9px 0",
          fontSize: 20,
          fontWeight: 850,
          color: theme.navyDeep,
        }}
      >
        Level-zero export
      </div>
    </div>
    <div
      style={{
        position: "absolute",
        left: 1180,
        top: 310,
        width: 650,
        height: 270,
        padding: 34,
        borderRadius: 24,
        backgroundColor: theme.sagePale,
        border: `2px solid ${theme.sage}`,
      }}
    >
      <div
        style={{
          fontSize: 18,
          color: theme.sage,
          letterSpacing: 3,
          fontWeight: 900,
        }}
      >
        DATA FOOTPRINT
      </div>
      <div
        style={{
          fontSize: 39,
          lineHeight: 1.18,
          marginTop: 25,
          fontWeight: 540,
        }}
      >
        Level-zero data by cube
      </div>
      <div style={{ fontSize: 24, color: theme.muted, marginTop: 20 }}>
        Used to validate what data actually exists.
      </div>
    </div>
    <div
      style={{
        position: "absolute",
        left: 1180,
        top: 610,
        width: 650,
        height: 290,
        padding: 34,
        borderRadius: 24,
        backgroundColor: theme.goldPale,
        border: `2px solid ${theme.gold}`,
      }}
    >
      <div
        style={{
          fontSize: 18,
          color: "#a67d12",
          letterSpacing: 3,
          fontWeight: 900,
        }}
      >
        PERFORMANCE EVIDENCE
      </div>
      <div
        style={{
          fontSize: 39,
          lineHeight: 1.18,
          marginTop: 25,
          fontWeight: 540,
        }}
      >
        Activity Report
      </div>
      <div style={{ fontSize: 24, color: theme.muted, marginTop: 20 }}>
        Used to measure real calculations, jobs, and user activity.
      </div>
    </div>
  </V2Shell>
);
