import React from "react";
import { fontFamily, theme } from "../theme";

export const Brand: React.FC<{ light?: boolean }> = ({ light = false }) => {
  const color = light ? theme.white : theme.navy;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        color,
        fontFamily,
      }}
    >
      <div
        style={{
          width: 13,
          height: 13,
          borderRadius: 99,
          backgroundColor: theme.gold,
        }}
      />
      <div style={{ lineHeight: 0.88 }}>
        <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: -1 }}>
          BryantPark
        </div>
        <div
          style={{
            fontSize: 10,
            letterSpacing: 5.2,
            fontWeight: 700,
            marginTop: 8,
          }}
        >
          CONSULTING
        </div>
      </div>
    </div>
  );
};
