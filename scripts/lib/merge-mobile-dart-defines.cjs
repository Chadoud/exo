"use strict";

const fs = require("fs");

const basePath = process.argv[2];
const tokenRaw = process.argv[3] || "";
const outPath = process.argv[4];

const base = JSON.parse(fs.readFileSync(basePath, "utf8"));
const token = tokenRaw.trim().replace(/^['"]|['"]$/g, "");
base.EXOSITES_CRASH_INGEST_URL =
  base.EXOSITES_CRASH_INGEST_URL || "https://api.exosites.ch/v1/crash-reports";
if (token) base.EXOSITES_CRASH_INGEST_TOKEN = token;
fs.writeFileSync(outPath, `${JSON.stringify(base, null, 2)}\n`);
process.stdout.write(token ? "crash ingest: token present\n" : "crash ingest: no local token\n");
