import React from "react";
import { Easing, interpolate, useCurrentFrame } from "remotion";
import { V2Shell } from "../components/V2Shell";
import { theme } from "../../theme";

const Card: React.FC<{
  number: string;
  title: string;
  detail: string;
  left: number;
  start: number;
  color: string;
}> = ({ number, title, detail, left, start, color }) => {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        position: "absolute",
        left,
        top: 360,
        width: 520,
        height: 430,
        padding: 38,
        backgroundColor: theme.white,
        borderRadius: 24,
        border: `2px solid ${theme.line}`,
        boxShadow: "0 20px 48px rgba(15,40,54,.12)",
        opacity: interpolate(frame, [start, start + 16], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        }),
        translate: interpolate(
          frame,
          [start, start + 18],
          ["0px 24px", "0px 0px"],
          {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          },
        ),
      }}
    >
      <div style={{ fontSize: 18, letterSpacing: 3, color, fontWeight: 900 }}>
        {number}
      </div>
      <div
        style={{
          fontSize: 52,
          lineHeight: 1.02,
          letterSpacing: -1.8,
          marginTop: 36,
          fontWeight: 500,
        }}
      >
        {title}
      </div>
      <div
        style={{
          width: 64,
          height: 7,
          backgroundColor: color,
          margin: "28px 0",
        }}
      />
      <div style={{ fontSize: 27, lineHeight: 1.35, color: theme.muted }}>
        {detail}
      </div>
    </div>
  );
};

export const QuestionsV2: React.FC = () => (
  <V2Shell
    eyebrow="THE PURPOSE"
    title="Three questions every planning team should be able to answer"
  >
    <Card
      number="01"
      title="What do you have?"
      detail="Inventory the environment."
      left={80}
      start={5}
      color={theme.sage}
    />
    <Card
      number="02"
      title="What is used?"
      detail="Separate adoption from installation."
      left={700}
      start={28}
      color={theme.gold}
    />
    <Card
      number="03"
      title="What comes next?"
      detail="Prioritize the right actions."
      left={1320}
      start={52}
      color={theme.orange}
    />
  </V2Shell>
);
