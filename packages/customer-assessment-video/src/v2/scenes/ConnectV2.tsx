import React from "react";
import { V2Shell } from "../components/V2Shell";
import { theme } from "../../theme";

export const ConnectV2: React.FC = () => (
  <V2Shell
    eyebrow="CONNECTED EVIDENCE"
    title="Two systems become one current-state view"
  >
    <div
      style={{
        position: "absolute",
        left: 120,
        top: 400,
        width: 430,
        padding: 40,
        borderRadius: 24,
        backgroundColor: theme.white,
        border: `3px solid ${theme.sage}`,
        fontSize: 42,
        fontWeight: 600,
      }}
    >
      NetSuite ERP
      <div
        style={{
          fontSize: 23,
          color: theme.muted,
          lineHeight: 1.45,
          marginTop: 24,
        }}
      >
        Transactions · modules
        <br />
        configuration · scripts
      </div>
    </div>
    <div
      style={{
        position: "absolute",
        left: 650,
        top: 485,
        width: 180,
        height: 8,
        backgroundColor: theme.gold,
      }}
    />
    <div
      style={{
        position: "absolute",
        left: 805,
        top: 450,
        fontSize: 66,
        color: theme.gold,
      }}
    >
      →
    </div>
    <div
      style={{
        position: "absolute",
        left: 930,
        top: 400,
        width: 430,
        padding: 40,
        borderRadius: 24,
        backgroundColor: theme.white,
        border: `3px solid ${theme.gold}`,
        fontSize: 42,
        fontWeight: 600,
      }}
    >
      Evidence model
      <div
        style={{
          fontSize: 23,
          color: theme.muted,
          lineHeight: 1.45,
          marginTop: 24,
        }}
      >
        Usage · structure
        <br />
        performance · risk
      </div>
    </div>
    <div
      style={{
        position: "absolute",
        left: 1460,
        top: 485,
        width: 150,
        height: 8,
        backgroundColor: theme.orange,
      }}
    />
    <div
      style={{
        position: "absolute",
        left: 1584,
        top: 450,
        fontSize: 66,
        color: theme.orange,
      }}
    >
      →
    </div>
    <div
      style={{
        position: "absolute",
        left: 1700,
        top: 400,
        width: 150,
        height: 220,
        borderRadius: 24,
        backgroundColor: theme.navyDeep,
        color: theme.white,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        fontSize: 26,
        lineHeight: 1.2,
        fontWeight: 700,
      }}
    >
      BPC
      <br />
      findings
    </div>
  </V2Shell>
);
