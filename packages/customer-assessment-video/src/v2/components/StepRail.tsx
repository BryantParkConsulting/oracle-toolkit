import React from "react";
import { Easing, interpolate, useCurrentFrame } from "remotion";
import { theme } from "../../theme";

export type InstructionStep = {
  number: string;
  title: string;
  detail: string;
  start: number;
  end: number;
};

export const StepRail: React.FC<{
  steps: InstructionStep[];
  accent?: string;
}> = ({ steps, accent = theme.sage }) => {
  const frame = useCurrentFrame();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {steps.map((step) => {
        const active = frame >= step.start && frame < step.end;
        return (
          <div
            key={step.number}
            style={{
              display: "grid",
              gridTemplateColumns: "48px 1fr",
              gap: 15,
              padding: "16px 17px",
              borderRadius: 15,
              border: `2px solid ${active ? accent : theme.line}`,
              backgroundColor: active ? `${accent}18` : theme.white,
              opacity: active ? 1 : 0.58,
              scale: active
                ? interpolate(frame, [step.start, step.start + 8], [0.985, 1], {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                    easing: Easing.bezier(0.16, 1, 0.3, 1),
                  })
                : 1,
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 99,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: active ? accent : theme.line,
                color: active ? theme.white : theme.muted,
                fontSize: 20,
                fontWeight: 900,
              }}
            >
              {step.number}
            </div>
            <div>
              <div style={{ fontSize: 23, fontWeight: 760, lineHeight: 1.15 }}>
                {step.title}
              </div>
              <div
                style={{
                  marginTop: 7,
                  color: theme.muted,
                  fontSize: 18,
                  lineHeight: 1.35,
                }}
              >
                {step.detail}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
