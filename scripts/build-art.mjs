import fs from "node:fs";
import { createHash } from "node:crypto";
import { nftSvg } from "../src/nft.js";
fs.mkdirSync("public/nft", { recursive: true });
const base = fs.readFileSync("public/art/prisoner-base.webp"),
  uri = "data:image/webp;base64," + base.toString("base64");
for (let id = 1; id <= 1000; id++)
  fs.writeFileSync("public/nft/" + id + ".svg", nftSvg(id, uri));
fs.writeFileSync(
  "public/art/collection.json",
  JSON.stringify(
    {
      supply: 1000,
      variant: "Outfit number only",
      base: "prisoner-base.webp",
      baseSha256: createHash("sha256").update(base).digest("hex"),
      images: "../nft/{1..1000}.svg",
    },
    null,
    2,
  ),
);
console.log(
  "Generated 1,000 identical-base NFT artworks; only number pixels differ. Base bytes:",
  base.length,
);
