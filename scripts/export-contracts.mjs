import fs from "node:fs";
fs.mkdirSync("public/contracts", { recursive: true });
for (const name of ["SquidGrid", "DepositConverter", "ChainlinkOracle"]) {
  const a = JSON.parse(fs.readFileSync(`out/${name}.sol/${name}.json`, "utf8"));
  fs.writeFileSync(
    `public/contracts/${name}.json`,
    JSON.stringify({ abi: a.abi, bytecode: a.bytecode.object }),
  );
}
console.log("Exported browser deployment artifacts");
