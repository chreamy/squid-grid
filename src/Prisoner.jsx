import React from "react";
import { numberPixels } from "./nft.js";
export default function Prisoner({ number = 456 }) {
  return (
    <svg
      className="prisoner-art"
      viewBox="0 0 1280 1280"
      role="img"
      aria-label={
        "Pixel prisoner wearing number " + String(number).padStart(3, "0")
      }
    >
      <image href="/art/prisoner-base.webp" width="1280" height="1280" />
      <g fill="#17463e" shapeRendering="crispEdges">
        {numberPixels(number).map((p, i) => (
          <rect key={i} x={p.x} y={p.y} width="8" height="8" />
        ))}
      </g>
    </svg>
  );
}
