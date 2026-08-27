import React from "react";
import { Audio } from "@remotion/media";
import {
  AbsoluteFill,
  Composition,
  Sequence,
  Series,
  staticFile,
} from "remotion";
import { EvidenceStage, SidePanel } from "../v2/components/EvidenceStage";
import { StepRail } from "../v2/components/StepRail";
import { V2Shell } from "../v2/components/V2Shell";
import { Brand } from "../components/Brand";
import { fontFamily, theme } from "../theme";

const PrivacyCover: React.FC<{
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
  dark?: boolean;
}> = ({ x, y, width, height, label, dark = false }) => (
  <div
    style={{
      position: "absolute",
      left: 72 + (x / 100) * 1250,
      top: 268 + (y / 100) * 703,
      width: (width / 100) * 1250,
      height: (height / 100) * 703,
      borderRadius: 7,
      background: dark
        ? theme.navy
        : "linear-gradient(90deg, #dce5e6, #eef3f2)",
      border: `1px solid ${dark ? theme.navyDeep : theme.line}`,
      color: theme.white,
      display: "flex",
      alignItems: "center",
      paddingLeft: label ? 14 : 0,
      fontSize: 17,
      fontWeight: 850,
      letterSpacing: label ? 1.2 : 0,
      zIndex: 9,
    }}
  >
    {label}
  </div>
);

const InputGuideIntro: React.FC = () => (
  <AbsoluteFill
    style={{
      backgroundColor: theme.navyDeep,
      color: theme.white,
      fontFamily,
      overflow: "hidden",
    }}
  >
    <div style={{ position: "absolute", top: 54, left: 74 }}>
      <Brand light />
    </div>
    <div
      style={{
        position: "absolute",
        right: -190,
        top: -280,
        width: 850,
        height: 850,
        borderRadius: 999,
        backgroundColor: theme.sage,
        opacity: 0.66,
      }}
    />
    <div
      style={{
        position: "absolute",
        right: 160,
        bottom: -300,
        width: 650,
        height: 650,
        borderRadius: 999,
        backgroundColor: theme.gold,
        opacity: 0.62,
      }}
    />
    <div style={{ position: "absolute", left: 105, top: 205, width: 1080 }}>
      <div
        style={{
          fontSize: 18,
          letterSpacing: 4.4,
          color: theme.gold,
          fontWeight: 900,
        }}
      >
        CLIENT DATA PREPARATION GUIDE
      </div>
      <div
        style={{
          fontSize: 82,
          lineHeight: 1.02,
          letterSpacing: -3.5,
          fontWeight: 390,
          marginTop: 28,
        }}
      >
        Prepare secure evidence
        <br />
        for a BPC assessment
      </div>
      <div style={{ display: "flex", gap: 22, marginTop: 48 }}>
        {[
          ["01", "NetSuite", "Read-only token access"],
          ["02", "Oracle NSPB", "Full environment backup"],
          ["03", "Performance", "Level-zero data + Activity Report"],
        ].map(([number, title, detail]) => (
          <div
            key={number}
            style={{
              width: 350,
              borderRadius: 19,
              padding: "24px 26px",
              backgroundColor: "rgba(255,255,255,.1)",
              border: "1px solid rgba(255,255,255,.22)",
            }}
          >
            <div style={{ fontSize: 16, color: theme.gold, fontWeight: 900 }}>
              {number}
            </div>
            <div style={{ fontSize: 31, fontWeight: 650, marginTop: 10 }}>
              {title}
            </div>
            <div style={{ fontSize: 20, color: "#c9ddd6", marginTop: 8 }}>
              {detail}
            </div>
          </div>
        ))}
      </div>
    </div>
  </AbsoluteFill>
);

const NetSuitePrerequisites: React.FC = () => (
  <V2Shell
    eyebrow="NETSUITE · BEFORE YOU BEGIN"
    title="Use a dedicated integration user and read-only role"
  >
    <div
      style={{
        position: "absolute",
        left: 120,
        top: 340,
        width: 1680,
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 34,
      }}
    >
      {[
        [
          "01",
          "Enable Token-Based Authentication",
          "Setup → Company → Enable Features → SuiteCloud",
        ],
        [
          "02",
          "Assign a dedicated read-only role",
          "Grant only the records and services required for the assessment.",
        ],
      ].map(([number, title, detail], index) => (
        <div
          key={number}
          style={{
            height: 410,
            borderRadius: 28,
            padding: 44,
            backgroundColor: theme.white,
            border: `3px solid ${index === 0 ? theme.sage : theme.gold}`,
            boxShadow: "0 20px 48px rgba(15,40,54,.12)",
          }}
        >
          <div
            style={{
              fontSize: 21,
              color: index === 0 ? theme.sage : "#a67d12",
              fontWeight: 900,
              letterSpacing: 3,
            }}
          >
            STEP {number}
          </div>
          <div
            style={{
              fontSize: 48,
              lineHeight: 1.14,
              marginTop: 30,
              fontWeight: 540,
            }}
          >
            {title}
          </div>
          <div
            style={{
              fontSize: 27,
              lineHeight: 1.45,
              marginTop: 28,
              color: theme.muted,
            }}
          >
            {detail}
          </div>
        </div>
      ))}
    </div>
  </V2Shell>
);

const IntegrationRecord: React.FC = () => (
  <V2Shell
    eyebrow="NETSUITE · INTEGRATION RECORD"
    title="Enable TBA only — leave OAuth Authorization Code Grant unchecked"
  >
    <EvidenceStage
      stillSrc="stills-v4/ns-consumer.png"
      wide
      focuses={[
        {
          x: 1.3,
          y: 31.6,
          width: 31,
          height: 7.2,
          start: 248,
          end: 412,
          label: "Select Token-Based Authentication",
          color: theme.sage,
        },
        {
          x: 1.3,
          y: 42.2,
          width: 29,
          height: 7.2,
          start: 405,
          end: 548,
          label: "Leave Authorization Code Grant unchecked",
          color: theme.orange,
        },
      ]}
    />
    <PrivacyCover x={0} y={0} width={100} height={3.8} />
    <PrivacyCover x={1.3} y={9.5} width={16} height={6.2} />
    <PrivacyCover x={64.5} y={9.4} width={16} height={17.5} />
    <PrivacyCover
      x={1.2}
      y={83.2}
      width={35}
      height={11.7}
      label="CENSORED · Consumer credentials"
      dark
    />
    <SidePanel kicker="CREATE THE INTEGRATION">
      <StepRail
        steps={[
          {
            number: "1",
            title: "Open a new record",
            detail: "Setup → Integration → Manage Integrations → New",
            start: 0,
            end: 144,
          },
          {
            number: "2",
            title: "Name and enable it",
            detail: "Use a clear name and keep State set to Enabled.",
            start: 144,
            end: 260,
          },
          {
            number: "3",
            title: "Select TBA only",
            detail: "Check Token-Based Authentication.",
            start: 260,
            end: 410,
          },
          {
            number: "4",
            title: "Leave OAuth unchecked",
            detail: "Do not select Authorization Code Grant. Save the record.",
            start: 410,
            end: 627,
          },
        ]}
      />
    </SidePanel>
  </V2Shell>
);

const ConsumerCredentials: React.FC = () => (
  <V2Shell
    eyebrow="NETSUITE · ONE-TIME VALUES"
    title="Store the Consumer Key and Consumer Secret securely"
  >
    <EvidenceStage
      stillSrc="stills-v4/ns-consumer.png"
      wide
      focuses={[
        {
          x: 1.1,
          y: 82.5,
          width: 36.5,
          height: 13.1,
          start: 5,
          end: 373,
          label: "Displayed only once",
          color: theme.orange,
        },
      ]}
    />
    <PrivacyCover x={0} y={0} width={100} height={3.8} />
    <PrivacyCover x={1.3} y={9.5} width={16} height={6.2} />
    <PrivacyCover x={64.5} y={9.4} width={16} height={17.5} />
    <PrivacyCover
      x={1.2}
      y={83.2}
      width={35}
      height={11.7}
      label="CENSORED · Consumer Key and Secret"
      dark
    />
    <SidePanel kicker="SECURE STORAGE" accent={theme.orange}>
      <StepRail
        accent={theme.orange}
        steps={[
          {
            number: "5",
            title: "Copy both values",
            detail:
              "Consumer Key and Consumer Secret cannot be retrieved later.",
            start: 0,
            end: 230,
          },
          {
            number: "6",
            title: "Use the secure channel",
            detail: "Store and transfer them securely — never by email.",
            start: 230,
            end: 378,
          },
        ]}
      />
    </SidePanel>
  </V2Shell>
);

const AccessTokenRoute: React.FC = () => (
  <V2Shell
    eyebrow="NETSUITE · ACCESS TOKEN"
    title="Create the token associated with the integration"
  >
    <Sequence durationInFrames={164}>
      <div
        style={{
          position: "absolute",
          left: 115,
          top: 350,
          width: 1690,
          padding: "58px 70px",
          borderRadius: 28,
          backgroundColor: theme.white,
          border: `3px solid ${theme.sage}`,
          boxShadow: "0 22px 54px rgba(15,40,54,.14)",
        }}
      >
        <div
          style={{
            fontSize: 22,
            color: theme.sage,
            letterSpacing: 3.2,
            fontWeight: 900,
          }}
        >
          NAVIGATION
        </div>
        <div
          style={{
            fontSize: 58,
            lineHeight: 1.25,
            marginTop: 35,
            fontWeight: 520,
          }}
        >
          Setup → Users/Roles → Access Tokens → New
        </div>
        <div style={{ fontSize: 27, color: theme.muted, marginTop: 32 }}>
          Users with the appropriate permission can also use Manage Access
          Tokens from the Settings portlet.
        </div>
      </div>
    </Sequence>
    <Sequence from={164} durationInFrames={308}>
      <EvidenceStage
        stillSrc="stills-v4/ns-token-form-43.png"
        wide
        focuses={[
          {
            x: 0.8,
            y: 14.9,
            width: 21,
            height: 10.8,
            start: 4,
            end: 304,
            label: "Application, user, role, and token name",
            color: theme.sage,
          },
        ]}
      />
      <PrivacyCover x={0} y={0} width={100} height={3.8} />
      <PrivacyCover x={1.1} y={20.4} width={24} height={5.2} />
    </Sequence>
    <SidePanel kicker="CREATE ACCESS TOKEN">
      <StepRail
        steps={[
          {
            number: "7",
            title: "Open Access Tokens",
            detail: "Use the Setup navigation and select New.",
            start: 0,
            end: 164,
          },
          {
            number: "8",
            title: "Choose the application",
            detail: "Select the integration record created for BPC.",
            start: 164,
            end: 300,
          },
          {
            number: "9",
            title: "Choose user and role",
            detail:
              "Use the approved user and dedicated read-only role, then Save.",
            start: 300,
            end: 472,
          },
        ]}
      />
    </SidePanel>
  </V2Shell>
);

const AccessTokenConfirmation: React.FC = () => (
  <V2Shell
    eyebrow="NETSUITE · TOKEN CONFIRMATION"
    title="Copy the Token ID and Token Secret before leaving the page"
  >
    <EvidenceStage
      stillSrc="stills-v4/ns-token-confirm.png"
      wide
      focuses={[
        {
          x: 0.8,
          y: 39.4,
          width: 31,
          height: 15.5,
          start: 5,
          end: 531,
          label: "Displayed only once",
          color: theme.orange,
        },
      ]}
    />
    <PrivacyCover x={0} y={0} width={100} height={3.8} />
    <PrivacyCover x={1.0} y={25.4} width={28} height={12.8} />
    <PrivacyCover
      x={1.0}
      y={44.7}
      width={30}
      height={11}
      label="CENSORED · Token ID and Token Secret"
      dark
    />
    <SidePanel kicker="FINAL NETSUITE VALUES" accent={theme.orange}>
      <StepRail
        accent={theme.orange}
        steps={[
          {
            number: "10",
            title: "Copy token values",
            detail: "Token ID and Token Secret appear only once.",
            start: 0,
            end: 238,
          },
          {
            number: "11",
            title: "Send five values",
            detail:
              "Account ID, Consumer Key, Consumer Secret, Token ID, and Token Secret.",
            start: 238,
            end: 390,
          },
          {
            number: "12",
            title: "Revoke when finished",
            detail:
              "The client can revoke the access token after the assessment.",
            start: 390,
            end: 536,
          },
        ]}
      />
    </SidePanel>
  </V2Shell>
);

const NspbIntro: React.FC = () => (
  <V2Shell
    eyebrow="ORACLE NSPB · COMPLETE BACKUP"
    title="Use Backup for the complete assessment package"
  >
    <div
      style={{
        position: "absolute",
        left: 115,
        top: 340,
        width: 1690,
        display: "grid",
        gridTemplateColumns: "1fr 120px 1fr",
        gap: 28,
        alignItems: "center",
      }}
    >
      <div
        style={{
          height: 410,
          borderRadius: 26,
          backgroundColor: theme.sagePale,
          border: `3px solid ${theme.sage}`,
          padding: 46,
        }}
      >
        <div
          style={{
            fontSize: 21,
            color: theme.sage,
            fontWeight: 900,
            letterSpacing: 3,
          }}
        >
          CORRECT FOR ASSESSMENT
        </div>
        <div style={{ fontSize: 64, marginTop: 36, fontWeight: 520 }}>
          Backup
        </div>
        <div
          style={{
            fontSize: 29,
            lineHeight: 1.45,
            color: theme.muted,
            marginTop: 26,
          }}
        >
          Complete environment artifacts and data.
        </div>
      </div>
      <div style={{ fontSize: 70, textAlign: "center", color: theme.gold }}>
        ≠
      </div>
      <div
        style={{
          height: 410,
          borderRadius: 26,
          backgroundColor: theme.orangePale,
          border: `3px solid ${theme.orange}`,
          padding: 46,
        }}
      >
        <div
          style={{
            fontSize: 21,
            color: theme.orange,
            fontWeight: 900,
            letterSpacing: 3,
          }}
        >
          INCREMENTAL USE
        </div>
        <div style={{ fontSize: 64, marginTop: 36, fontWeight: 520 }}>
          Export
        </div>
        <div
          style={{
            fontSize: 29,
            lineHeight: 1.45,
            color: theme.muted,
            marginTop: 26,
          }}
        >
          Only the categories or artifacts selected.
        </div>
      </div>
    </div>
  </V2Shell>
);

const NspbBackup: React.FC = () => (
  <V2Shell
    eyebrow="ORACLE NSPB · MIGRATION"
    title="Choose Backup — do not select individual export categories"
  >
    <EvidenceStage
      stillSrc="stills-v2/migration-categories.png"
      wide
      focuses={[
        {
          x: 88.1,
          y: 5.8,
          width: 5.8,
          height: 4.8,
          start: 4,
          end: 533,
          label: "Backup",
          color: theme.gold,
          labelAlign: "right",
        },
      ]}
    />
    <PrivacyCover x={0} y={0} width={100} height={5.1} />
    <SidePanel kicker="FULL ENVIRONMENT BACKUP" accent={theme.gold}>
      <StepRail
        accent={theme.gold}
        steps={[
          {
            number: "1",
            title: "Open Migration",
            detail: "From the Home page, open Tools → Migration.",
            start: 0,
            end: 198,
          },
          {
            number: "2",
            title: "Choose Backup",
            detail:
              "Do not use selected-category Export for the complete assessment.",
            start: 198,
            end: 390,
          },
          {
            number: "3",
            title: "Capture the environment",
            detail: "Backup includes available artifacts and application data.",
            start: 390,
            end: 538,
          },
        ]}
      />
    </SidePanel>
  </V2Shell>
);

const BackupCompletion: React.FC = () => (
  <V2Shell
    eyebrow="ORACLE NSPB · BACKUP STATUS"
    title="Run during low activity, verify completion, and download the ZIP"
  >
    <Sequence durationInFrames={267}>
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
            end: 263,
            label: "Wait for Completed",
            color: theme.sage,
          },
        ]}
      />
      <PrivacyCover x={0} y={0} width={100} height={5.1} />
      <PrivacyCover x={22.8} y={13.5} width={16.5} height={3.6} />
    </Sequence>
    <Sequence from={267} durationInFrames={331}>
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
            end: 327,
            label: "Download the snapshot ZIP",
            color: theme.gold,
            labelAlign: "right",
          },
        ]}
      />
      <PrivacyCover x={0} y={0} width={100} height={5.1} />
    </Sequence>
    <SidePanel kicker="VERIFY AND DOWNLOAD">
      <StepRail
        steps={[
          {
            number: "4",
            title: "Use a low-activity window",
            detail: "Avoid active calculations, loads, and restructures.",
            start: 0,
            end: 104,
          },
          {
            number: "5",
            title: "Wait for Completed",
            detail:
              "Confirm the Migration Status Report completes successfully.",
            start: 104,
            end: 267,
          },
          {
            number: "6",
            title: "Download unchanged",
            detail: "Do not extract or modify the snapshot ZIP.",
            start: 267,
            end: 598,
          },
        ]}
      />
    </SidePanel>
  </V2Shell>
);

const ProtectedEnvironment: React.FC = () => (
  <>
    <PrivacyCover x={0} y={0} width={100} height={5.1} />
    <PrivacyCover x={14.3} y={14.3} width={64} height={4.1} />
    <PrivacyCover x={0} y={97.2} width={34} height={2.8} />
  </>
);

const LevelZeroStart: React.FC = () => (
  <V2Shell
    eyebrow="ORACLE NSPB · LEVEL-ZERO DATA"
    title="Export data from every planning cube for performance analysis"
  >
    <EvidenceStage
      stillSrc="stills-v2/data-export-menu.png"
      wide
      focuses={[
        {
          x: 19.1,
          y: 31.3,
          width: 10.3,
          height: 25.6,
          start: 175,
          end: 516,
          label: "Export Level Zero Data",
          color: theme.sage,
        },
      ]}
    />
    <ProtectedEnvironment />
    <SidePanel kicker="CALCULATION MANAGER">
      <StepRail
        steps={[
          {
            number: "1",
            title: "Open Database Properties",
            detail: "Calculation Manager → System View → Database Properties",
            start: 0,
            end: 175,
          },
          {
            number: "2",
            title: "Expand Planning",
            detail: "Open the application and locate each cube.",
            start: 175,
            end: 342,
          },
          {
            number: "3",
            title: "Right-click every cube",
            detail: "Choose Export Level Zero Data.",
            start: 342,
            end: 521,
          },
        ]}
      />
    </SidePanel>
  </V2Shell>
);

const LevelZeroFinish: React.FC = () => (
  <V2Shell
    eyebrow="ORACLE NSPB · LEVEL-ZERO DATA"
    title="Name the ZIP, wait for completion, and repeat for every cube"
  >
    <Sequence durationInFrames={135}>
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
            end: 131,
            label: "Enter a unique ZIP name",
            color: theme.gold,
          },
        ]}
      />
      <ProtectedEnvironment />
    </Sequence>
    <Sequence from={135} durationInFrames={91}>
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
            end: 87,
            label: "Wait for completion",
            color: theme.sage,
          },
        ]}
      />
      <ProtectedEnvironment />
    </Sequence>
    <SidePanel kicker="ONE ZIP PER CUBE" accent={theme.gold}>
      <StepRail
        accent={theme.gold}
        steps={[
          {
            number: "4",
            title: "Name the ZIP",
            detail: "Use a unique file name for each cube.",
            start: 0,
            end: 135,
          },
          {
            number: "5",
            title: "Wait and repeat",
            detail: "Confirm completion, then repeat for every cube.",
            start: 135,
            end: 226,
          },
        ]}
      />
    </SidePanel>
  </V2Shell>
);

const LevelZeroDownload: React.FC = () => (
  <V2Shell
    eyebrow="ORACLE NSPB · INBOX/OUTBOX"
    title="Download every level-zero ZIP from Planning"
  >
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
          end: 312,
          label: "Actions → Download File",
          color: theme.gold,
        },
      ]}
    />
    <ProtectedEnvironment />
    <SidePanel kicker="DOWNLOAD THE FILES" accent={theme.gold}>
      <StepRail
        accent={theme.gold}
        steps={[
          {
            number: "6",
            title: "Return to Planning",
            detail: "Application → Overview → Actions",
            start: 0,
            end: 100,
          },
          {
            number: "7",
            title: "Open Inbox/Outbox",
            detail: "Select Inbox/Outbox Explorer.",
            start: 100,
            end: 215,
          },
          {
            number: "8",
            title: "Download every ZIP",
            detail: "Use the Actions menu for each cube export.",
            start: 215,
            end: 317,
          },
        ]}
      />
    </SidePanel>
  </V2Shell>
);

const ActivityReport: React.FC = () => (
  <V2Shell
    eyebrow="ORACLE NSPB · ACTIVITY REPORT"
    title="Include the latest Activity Report for usage and performance evidence"
  >
    <div
      style={{
        position: "absolute",
        left: 120,
        top: 340,
        width: 1680,
        display: "grid",
        gridTemplateColumns: "1.1fr .9fr",
        gap: 34,
      }}
    >
      <div
        style={{
          height: 440,
          borderRadius: 28,
          backgroundColor: theme.navyDeep,
          color: theme.white,
          padding: 50,
        }}
      >
        <div
          style={{
            fontSize: 20,
            color: theme.gold,
            fontWeight: 900,
            letterSpacing: 3,
          }}
        >
          NAVIGATION
        </div>
        <div
          style={{
            fontSize: 52,
            lineHeight: 1.28,
            marginTop: 34,
            fontWeight: 520,
          }}
        >
          Application → Overview → Activity Reports
        </div>
        <div
          style={{
            fontSize: 25,
            lineHeight: 1.45,
            color: "#c9ddd6",
            marginTop: 28,
          }}
        >
          Open the latest report and include it with the assessment package.
        </div>
      </div>
      <div
        style={{
          height: 440,
          borderRadius: 28,
          backgroundColor: theme.white,
          border: `3px solid ${theme.sage}`,
          padding: 46,
        }}
      >
        <div
          style={{
            fontSize: 20,
            color: theme.sage,
            fontWeight: 900,
            letterSpacing: 3,
          }}
        >
          WHAT IT SHOWS
        </div>
        <div
          style={{
            fontSize: 30,
            lineHeight: 1.7,
            marginTop: 28,
            color: theme.ink,
          }}
        >
          ✓ User activity
          <br />✓ Slow requests
          <br />✓ Calculations and jobs
          <br />✓ Application performance
        </div>
      </div>
    </div>
  </V2Shell>
);

const FinalChecklist: React.FC = () => (
  <AbsoluteFill
    style={{ backgroundColor: theme.navyDeep, color: theme.white, fontFamily }}
  >
    <div style={{ position: "absolute", top: 54, left: 74 }}>
      <Brand light />
    </div>
    <div style={{ position: "absolute", left: 110, top: 185, width: 1260 }}>
      <div
        style={{
          fontSize: 19,
          color: theme.gold,
          fontWeight: 900,
          letterSpacing: 4,
        }}
      >
        FINAL CHECK
      </div>
      <div
        style={{
          fontSize: 72,
          fontWeight: 390,
          letterSpacing: -2.4,
          marginTop: 26,
        }}
      >
        Your secure assessment package
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 18,
          marginTop: 42,
        }}
      >
        {[
          "NetSuite Account ID + four credentials",
          "Complete NSPB backup ZIP",
          "One level-zero ZIP per cube",
          "Latest Activity Report",
        ].map((item) => (
          <div
            key={item}
            style={{
              padding: "24px 28px",
              borderRadius: 16,
              backgroundColor: "rgba(255,255,255,.1)",
              fontSize: 25,
              border: "1px solid rgba(255,255,255,.2)",
            }}
          >
            <span style={{ color: theme.gold, marginRight: 16 }}>✓</span>
            {item}
          </div>
        ))}
      </div>
      <div style={{ fontSize: 31, color: "#c9ddd6", marginTop: 42 }}>
        Transfer files and credentials only through the approved secure channel.
      </div>
    </div>
  </AbsoluteFill>
);

const DataPreparationGuideVideo: React.FC = () => (
  <AbsoluteFill>
    <Audio src={staticFile("audio/data-preparation-guide.mp3")} volume={1} />
    <Series>
      <Series.Sequence durationInFrames={488}>
        <InputGuideIntro />
      </Series.Sequence>
      <Series.Sequence durationInFrames={335}>
        <NetSuitePrerequisites />
      </Series.Sequence>
      <Series.Sequence durationInFrames={627}>
        <IntegrationRecord />
      </Series.Sequence>
      <Series.Sequence durationInFrames={378}>
        <ConsumerCredentials />
      </Series.Sequence>
      <Series.Sequence durationInFrames={472}>
        <AccessTokenRoute />
      </Series.Sequence>
      <Series.Sequence durationInFrames={536}>
        <AccessTokenConfirmation />
      </Series.Sequence>
      <Series.Sequence durationInFrames={220}>
        <NspbIntro />
      </Series.Sequence>
      <Series.Sequence durationInFrames={538}>
        <NspbBackup />
      </Series.Sequence>
      <Series.Sequence durationInFrames={598}>
        <BackupCompletion />
      </Series.Sequence>
      <Series.Sequence durationInFrames={521}>
        <LevelZeroStart />
      </Series.Sequence>
      <Series.Sequence durationInFrames={226}>
        <LevelZeroFinish />
      </Series.Sequence>
      <Series.Sequence durationInFrames={317}>
        <LevelZeroDownload />
      </Series.Sequence>
      <Series.Sequence durationInFrames={467}>
        <ActivityReport />
      </Series.Sequence>
      <Series.Sequence durationInFrames={442}>
        <FinalChecklist />
      </Series.Sequence>
    </Series>
  </AbsoluteFill>
);

export const DataPreparationGuideComposition = () => (
  <Composition
    id="BPC-Client-Data-Preparation-Guide"
    component={DataPreparationGuideVideo}
    durationInFrames={6165}
    fps={30}
    width={1920}
    height={1080}
  />
);
