import React from "react";
import { V2Shell } from "../components/V2Shell";
import { theme } from "../../theme";

export const InputsV2: React.FC = () => (
  <V2Shell
    eyebrow="TWO CONTROLLED INPUTS"
    title="Connect read-only NetSuite evidence with a complete NSPB backup"
  >
    <div
      style={{
        position: "absolute",
        left: 100,
        top: 350,
        width: 760,
        height: 460,
        borderRadius: 28,
        backgroundColor: theme.white,
        border: `3px solid ${theme.sage}`,
        padding: 42,
        boxShadow: "0 20px 48px rgba(15,40,54,.12)",
      }}
    >
      <div
        style={{
          fontSize: 22,
          color: theme.sage,
          fontWeight: 900,
          letterSpacing: 3,
        }}
      >
        INPUT 01
      </div>
      <div style={{ fontSize: 56, marginTop: 25, fontWeight: 500 }}>
        NetSuite ERP
      </div>
      <div
        style={{
          fontSize: 31,
          lineHeight: 1.5,
          color: theme.muted,
          marginTop: 30,
        }}
      >
        Dedicated token-based integration
        <br />
        Read-only role
        <br />
        Secure credential transfer
      </div>
    </div>
    <div
      style={{
        position: "absolute",
        left: 1060,
        top: 350,
        width: 760,
        height: 460,
        borderRadius: 28,
        backgroundColor: theme.white,
        border: `3px solid ${theme.gold}`,
        padding: 42,
        boxShadow: "0 20px 48px rgba(15,40,54,.12)",
      }}
    >
      <div
        style={{
          fontSize: 22,
          color: "#b38a13",
          fontWeight: 900,
          letterSpacing: 3,
        }}
      >
        INPUT 02
      </div>
      <div style={{ fontSize: 56, marginTop: 25, fontWeight: 500 }}>
        Oracle NSPB
      </div>
      <div
        style={{
          fontSize: 31,
          lineHeight: 1.5,
          color: theme.muted,
          marginTop: 30,
        }}
      >
        Full Migration backup
        <br />
        Optional level-zero data
        <br />
        Latest Activity Report
      </div>
    </div>
    <div
      style={{
        position: "absolute",
        left: 884,
        top: 525,
        width: 150,
        height: 8,
        backgroundColor: theme.orange,
      }}
    />
  </V2Shell>
);
