import { ImageResponse } from "next/og";
export function brandIcon(size: number) {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#332b24",
        color: "#e4ce9f",
        fontSize: size * 0.65,
        borderRadius: size * 0.18,
        fontFamily: "serif",
      }}
    >
      C
    </div>,
    { width: size, height: size },
  );
}
