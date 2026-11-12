// Static prefix-sharded city index from GeoNames cities1000, CC BY 4.0.
// https://www.geonames.org/  |  https://download.geonames.org/export/dump/
import fs from "node:fs";
import path from "node:path";

const [citiesFile, adminFile] = process.argv.slice(2);
if (!citiesFile || !adminFile) throw new Error("Supply cities1000.txt and admin1CodesASCII.txt");
const normalize = value => String(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const shardKey = value => normalize(value).slice(0, 2).padEnd(2, "_");
const adminNames = new Map();
for (const line of fs.readFileSync(adminFile, "utf8").split(/\r?\n/)) {
  const [key, name, ascii] = line.split("\t");
  if (key && (ascii || name)) adminNames.set(key, ascii || name);
}
const dest = path.resolve("public/locations");
fs.rmSync(dest, { recursive: true, force: true });
fs.mkdirSync(dest, { recursive: true });
const shards = new Map();
const seen = new Set();
let count = 0;
for (const line of fs.readFileSync(citiesFile, "utf8").split(/\r?\n/)) {
  if (!line) continue;
  const f = line.split("\t");
  const [id, name, ascii, , latRaw, lonRaw, featureClass, featureCode, country, , admin1] = f;
  if (featureClass !== "P" || !/^PPL/.test(featureCode) || !/^\d+$/.test(id) || !/^[A-Z]{2}$/.test(country)) continue;
  const lat = Number(latRaw), lon = Number(lonRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) continue;
  const row = { id: Number(id), n: (ascii || name).trim(), a: adminNames.get(country + "." + admin1) || admin1 || "", c: country, x: Number(lat.toFixed(3)), y: Number(lon.toFixed(3)), p: Math.max(0, Number(f[14]) || 0) };
  if (!row.n || seen.has(row.id)) continue;
  seen.add(row.id);
  for (const key of new Set([shardKey(name), shardKey(ascii || name)])) {
    const list = shards.get(key) || [];
    list.push(row);
    shards.set(key, list);
  }
  count++;
}
if (count < 100000) throw new Error("GeoNames extract unexpectedly small: " + count);
for (const [key, list] of shards) {
  list.sort((a, b) => b.p - a.p || a.n.localeCompare(b.n) || a.id - b.id);
  fs.writeFileSync(path.join(dest, key + ".json"), JSON.stringify(list));
}
fs.writeFileSync(path.join(dest, "manifest.json"), JSON.stringify({source:"GeoNames cities1000",license:"CC BY 4.0",attribution:"https://www.geonames.org/",places:count,shards:shards.size,generatedAt:new Date().toISOString()}));
console.log("Published " + count + " places across " + shards.size + " prefix shards.");
