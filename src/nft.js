const font = {
  0: ["111", "101", "101", "101", "111"],
  1: ["010", "110", "010", "010", "111"],
  2: ["111", "001", "111", "100", "111"],
  3: ["111", "001", "111", "001", "111"],
  4: ["101", "101", "111", "001", "001"],
  5: ["111", "100", "111", "001", "111"],
  6: ["111", "100", "111", "101", "111"],
  7: ["111", "001", "010", "010", "010"],
  8: ["111", "101", "111", "101", "111"],
  9: ["111", "101", "111", "001", "111"],
};
export function numberPixels(number) {
  const digits = String(number).padStart(3, "0"),
    step = 9,
    width = (digits.length * 4 - 1) * step,
    startX = 620 - width / 2,
    startY = 619;
  return [...digits].flatMap((d, i) =>
    font[d].flatMap((row, y) =>
      [...row].flatMap((bit, x) =>
        bit === "1"
          ? [{ x: startX + (i * 4 + x) * step, y: startY + y * step }]
          : [],
      ),
    ),
  );
}
export function nftSvg(number, baseDataUri) {
  const rects = numberPixels(number)
    .map((p) => '<rect x="' + p.x + '" y="' + p.y + '" width="8" height="8"/>')
    .join("");
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 1280"><rect width="1280" height="1280" fill="#ede8d9"/><image href="' +
    baseDataUri +
    '" width="1280" height="1280"/><g fill="#17463e" shape-rendering="crispEdges">' +
    rects +
    "</g></svg>"
  );
}
