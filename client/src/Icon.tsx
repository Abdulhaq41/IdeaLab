import type { CSSProperties } from "react";
const icons: Record<string, string> = {
  cafe: "M4 10h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5v-6Zm13 1h2a3 3 0 0 1 0 6h-2M7 3v3m4-3v3m4-3v3",
  grow: "m4 18 6-7 4 3 6-9m-5 0h5v5M4 22h16",
  story: "M5 3h15v18H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm2 0v18m4-13h6m-6 4h6",
  shop: "M3 7h18l-2-4H5L3 7Zm1 0v14h16V7M8 21v-8h8v8",
  profile: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-8 9a8 8 0 0 1 16 0",
  coin: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm3-15H9v5h6v5H9",
  star: "m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z",
  arrow: "M5 12h14m-5-5 5 5-5 5",
  back: "m14 5-7 7 7 7",
  close: "m6 6 12 12M6 18 18 6",
  check: "m4 12 5 5L20 6",
  clock: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-15v6l4 2",
  team: "M9 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9a7 7 0 0 1 14 0m0-17a4 4 0 0 1 0 8m3 3a6 6 0 0 1 3 6",
  edit: "m4 17 12-12 4 4L8 21H4v-4Zm10-10 4 4",
  leaf: "M20 3C8 2 1 9 6 16s16 1 14-13ZM5 20 16 8",
  spark: "m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3 3-7Z",
  box: "m3 7 9-5 9 5v10l-9 5-9-5V7Zm0 0 9 5 9-5m-9 5v10",
  info: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-11v6m0-10v1",
  sound: "M4 9h4l5-5v16l-5-5H4V9Zm12-2a7 7 0 0 1 0 10m2-13a11 11 0 0 1 0 16",
  sun: "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0-15v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1",
  shield: "m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6l9-4Zm-5 10 3 3 7-7",
};
export function Icon({
  name,
  size = 22,
  style,
}: {
  name: string;
  size?: number;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
    >
      <path d={icons[name] || icons.cafe} />
    </svg>
  );
}
