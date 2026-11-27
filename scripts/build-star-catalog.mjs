#!/usr/bin/env node
/**
 * Builds the commercial-safe 10.0-ly station-centered real star catalog:
 *   assets/astro/star_catalog_10ly.bin
 *
 * Sources (100% commercial-safe, zero CC BY-SA):
 *   - ESA Hipparcos Main Catalogue (I/239/hip_main, ESA 1997, CC BY 3.0 IGO) for Johnson Vmag & B-V
 *   - ESA Hipparcos, the New Reduction (I/311/hip2, van Leeuwen 2007, CC BY 3.0 IGO) for ICRS RA/Dec & Plx
 *
 * Usage:
 *   node scripts/build-star-catalog.mjs            # fetch live from VizieR CfA mirror
 *   node scripts/build-star-catalog.mjs --cached   # reuse /tmp cached TSVs if present
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd());
const OUT_PATH = path.join(ROOT, 'assets', 'astro', 'star_catalog_10ly.bin');

const CACHE_HIP_MAIN = '/tmp/instance1419_hip_main_78.tsv';
const CACHE_HIP2 = '/tmp/instance1419_hip2_82.tsv';

const VIZIER_HIP_MAIN_URL =
  'https://vizier.cfa.harvard.edu/viz-bin/asu-tsv?-source=I/239/hip_main&-out.max=50000&-out=HIP,RAICRS,DEICRS,Vmag,Plx,B-V&Vmag=<=7.8';
const VIZIER_HIP2_URL =
  'https://vizier.cfa.harvard.edu/viz-bin/asu-tsv?-source=I/311/hip2&-out.max=50000&-out=HIP,RArad,DErad,Plx,Hpmag,B-V&Hpmag=<=8.2';

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const LY_PER_PC = 3.26156;

// Station offset: 10.0 ly opposite to Sol-Centauri bearing (RA=46.0°, Dec=-16.0° in anomalies.json)
// so that looking from the probe back toward Sol puts Sol dead-on at (RA=46.0°, Dec=-16.0°).
const SOL_BEARING_RA_DEG = 46.0;
const SOL_BEARING_DEC_DEG = -16.0;
const PROBE_DISTANCE_LY = 10.0;
const NEARBY_TRANSFORM_LIMIT_LY = 100.0;
const TARGET_STAR_COUNT = 18000;

// Cumulative targets across Tiers 1..6 (Tiers 1..3 keep 100% of real stars; Tiers 4..6 stratify uniformly)
const TIER_CUMULATIVE_TARGETS = {
  1: null, // V <= 4.5 + Sol & Alpha Cen AB (keep all)
  2: null, // 4.5 < V <= 5.5 (keep all)
  3: null, // 5.5 < V <= 6.3 (keep all)
  4: 12500, // 6.3 < V <= 6.9
  5: 16500, // 6.9 < V <= 7.4
  6: 18000, // 7.4 < V <= 7.8
};

// IAU J2000 North Galactic Pole
const NGP_RA_DEG = 192.85948;
const NGP_DEC_DEG = 27.12825;

// Alpha Centauri A & B HIP IDs (replaced by unified Alpha Centauri AB entry with authoritative d=4.37 ly)
const ALPHA_CEN_HIPS = new Set([71681, 71683]);

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function raDecToVec3(raDeg, decDeg, radius = 1) {
  const ra = raDeg * DEG_TO_RAD;
  const dec = decDeg * DEG_TO_RAD;
  return [
    radius * Math.cos(dec) * Math.sin(ra),
    radius * Math.sin(dec),
    -radius * Math.cos(dec) * Math.cos(ra),
  ];
}

function vec3ToRaDec(v) {
  const r = Math.hypot(v[0], v[1], v[2]);
  if (r <= 1e-12) return { raDeg: 0, decDeg: 0, dist: 0 };
  const decDeg = Math.asin(clamp(v[1] / r, -1, 1)) * RAD_TO_DEG;
  let raDeg = Math.atan2(v[0], -v[2]) * RAD_TO_DEG;
  if (raDeg < 0) raDeg += 360;
  return { raDeg, decDeg, dist: r };
}

function normalizeRa180(raDeg) {
  let ra = ((raDeg % 360) + 360) % 360;
  if (ra > 180) ra -= 360;
  return ra;
}

const NGP_VEC = raDecToVec3(NGP_RA_DEG, NGP_DEC_DEG, 1);

function galacticLatitudeDeg(raDeg, decDeg) {
  const dir = raDecToVec3(raDeg, decDeg, 1);
  const sinB = clamp(dir[0] * NGP_VEC[0] + dir[1] * NGP_VEC[1] + dir[2] * NGP_VEC[2], -1, 1);
  return Math.asin(sinB) * RAD_TO_DEG;
}

async function fetchOrReadCache(url, cachePath, useCache) {
  if (useCache && fs.existsSync(cachePath)) {
    console.log(`[star-catalog] Using cached ${cachePath}`);
    return fs.readFileSync(cachePath, 'utf8');
  }
  console.log(`[star-catalog] Fetching ${url}`);
  const res = await fetch(url, { headers: { 'User-Agent': 'Instance-1419-CatalogBuilder/1.0' } });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} fetching ${url}`);
  }
  const text = await res.text();
  if (useCache) {
    fs.writeFileSync(cachePath, text, 'utf8');
  }
  return text;
}

function parseVizieRTsv(tsvText) {
  const lines = tsvText.split(/\r?\n/);
  let cols = null;
  let pastSeparator = false;
  const rows = [];
  for (const line of lines) {
    if (!line || line.startsWith('#')) continue;
    if (!cols) {
      cols = line.split('\t').map((s) => s.trim());
      continue;
    }
    if (!pastSeparator) {
      if (line.startsWith('---')) pastSeparator = true;
      continue;
    }
    const parts = line.split('\t');
    const row = {};
    for (let i = 0; i < cols.length; i++) {
      row[cols[i]] = (parts[i] ?? '').trim();
    }
    rows.push(row);
  }
  return rows;
}

function assignBand(bv, apparentV, raDeg, decDeg) {
  if (bv < 0.0) return 0; // UV / X-Ray: hot O/B stars
  if (bv >= 1.4) return 3; // Mid-IR: cool M/K giants
  if (bv >= 1.0) return 2; // Near-IR
  const galLatAbs = Math.abs(galacticLatitudeDeg(raDeg, decDeg));
  if (apparentV > 5.5 && galLatAbs <= 12.0) return 2; // Faint galactic-plane dust-veiled stars -> Near-IR
  return 1; // Visible
}

function assignUnlockTier(apparentV, forcedTier = null) {
  if (forcedTier !== null) return forcedTier;
  if (apparentV <= 4.5) return 1;
  if (apparentV <= 5.5) return 2;
  if (apparentV <= 6.3) return 3;
  if (apparentV <= 6.9) return 4;
  if (apparentV <= 7.4) return 5;
  return 6;
}

function sampleStratifiedByRa(stars, count) {
  if (stars.length <= count) return stars.slice();
  const nearby = stars.filter((s) => s.isNearby);
  const distant = stars.filter((s) => !s.isNearby).sort((a, b) => a.raDeg - b.raDeg || a.decDeg - b.decDeg || a.hip - b.hip);

  if (nearby.length >= count) {
    const sortedNearby = nearby.slice().sort((a, b) => a.apparentV - b.apparentV || a.hip - b.hip);
    return sortedNearby.slice(0, count);
  }

  const remaining = count - nearby.length;
  const picked = [...nearby];
  for (let i = 0; i < remaining; i++) {
    const idx = Math.floor((i * distant.length) / remaining);
    picked.push(distant[idx]);
  }
  return picked;
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const useCache = args.has('--cached');

  const [hipMainTsv, hip2Tsv] = await Promise.all([
    fetchOrReadCache(VIZIER_HIP_MAIN_URL, CACHE_HIP_MAIN, useCache),
    fetchOrReadCache(VIZIER_HIP2_URL, CACHE_HIP2, useCache),
  ]);

  const hipMainRows = parseVizieRTsv(hipMainTsv);
  const hip2Rows = parseVizieRTsv(hip2Tsv);
  console.log(`[star-catalog] Parsed ${hipMainRows.length} I/239/hip_main rows, ${hip2Rows.length} I/311/hip2 rows`);

  const hip2ById = new Map();
  for (const r of hip2Rows) {
    const hip = Number(r.HIP);
    if (Number.isFinite(hip) && hip > 0) {
      hip2ById.set(hip, r);
    }
  }

  const solDir = raDecToVec3(SOL_BEARING_RA_DEG, SOL_BEARING_DEC_DEG, 1.0);
  const probePos = solDir.map((c) => -PROBE_DISTANCE_LY * c);

  const catalog = [];

  // 1. Insert Sol (M_V = 4.83, B-V = 0.65) at origin (0,0,0) viewed from P -> exact (46.0°, -16.0°)
  const solFromProbe = [-probePos[0], -probePos[1], -probePos[2]];
  const solProj = vec3ToRaDec(solFromProbe);
  const solDistPc = PROBE_DISTANCE_LY / LY_PER_PC;
  const solApparentV = 4.83 + 5 * Math.log10(solDistPc / 10);
  const solEntry = {
    hip: -1,
    name: 'Sol',
    raDeg: solProj.raDeg,
    decDeg: solProj.decDeg,
    apparentV: solApparentV,
    bv: 0.65,
    band: 1,
    unlockTier: 1,
    isNearby: true,
    distFromProbeLy: PROBE_DISTANCE_LY,
  };
  catalog.push(solEntry);

  // 2. Insert Alpha Centauri AB (M_V = 4.38, J2000 RA 219.9°, Dec -60.8°, d=4.37 ly, B-V=0.71)
  const acenPos = raDecToVec3(219.9, -60.8, 4.37);
  const acenFromProbe = [acenPos[0] - probePos[0], acenPos[1] - probePos[1], acenPos[2] - probePos[2]];
  const acenProj = vec3ToRaDec(acenFromProbe);
  const acenDistPc = acenProj.dist / LY_PER_PC;
  const acenApparentV = 4.38 + 5 * Math.log10(acenDistPc / 10);
  const acenEntry = {
    hip: -2,
    name: 'Alpha Centauri AB',
    raDeg: acenProj.raDeg,
    decDeg: acenProj.decDeg,
    apparentV: acenApparentV,
    bv: 0.71,
    band: 1,
    unlockTier: 1,
    isNearby: true,
    distFromProbeLy: acenProj.dist,
  };
  catalog.push(acenEntry);

  let transformedNearbyCount = 0;

  // 3. Process all real Hipparcos stars
  for (const r of hipMainRows) {
    const hip = Number(r.HIP);
    if (!Number.isFinite(hip) || ALPHA_CEN_HIPS.has(hip)) continue;

    const r2 = hip2ById.get(hip);
    const raRaw = parseFloat(r2 ? r2.RArad : r.RAICRS);
    const decRaw = parseFloat(r2 ? r2.DErad : r.DEICRS);
    const vmag = parseFloat(r.Vmag);
    const bv = parseFloat((r2 && r2['B-V']) || r['B-V']);
    const plx = parseFloat(r2 ? r2.Plx : r.Plx);

    if (!Number.isFinite(raRaw) || !Number.isFinite(decRaw) || !Number.isFinite(vmag) || !Number.isFinite(bv)) {
      continue;
    }

    let raDeg = raRaw;
    let decDeg = decRaw;
    let apparentV = vmag;
    let isNearby = false;

    if (Number.isFinite(plx) && plx > 0) {
      const distLy = (1000 / plx) * LY_PER_PC;
      if (distLy < NEARBY_TRANSFORM_LIMIT_LY) {
        const starPos = raDecToVec3(raRaw, decRaw, distLy);
        const rel = [starPos[0] - probePos[0], starPos[1] - probePos[1], starPos[2] - probePos[2]];
        const proj = vec3ToRaDec(rel);
        const newDistLy = Math.max(0.1, proj.dist);
        raDeg = proj.raDeg;
        decDeg = proj.decDeg;
        apparentV = vmag + 5 * Math.log10(newDistLy / distLy);
        isNearby = true;
        transformedNearbyCount++;
      }
    }

    if (apparentV > 7.8) continue;

    const band = assignBand(bv, apparentV, raDeg, decDeg);
    const unlockTier = assignUnlockTier(apparentV);
    catalog.push({
      hip,
      raDeg,
      decDeg,
      apparentV,
      bv,
      band,
      unlockTier,
      isNearby,
    });
  }

  // Group into tiers 1..6
  const tiers = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
  for (const star of catalog) {
    tiers[star.unlockTier].push(star);
  }

  const selected = [];
  for (let t = 1; t <= 6; t++) {
    const cap = TIER_CUMULATIVE_TARGETS[t];
    if (cap === null) {
      selected.push(...tiers[t]);
    } else {
      const needed = Math.max(0, cap - selected.length);
      selected.push(...sampleStratifiedByRa(tiers[t], needed));
    }
  }

  if (selected.length !== TARGET_STAR_COUNT) {
    throw new Error(`Expected ${TARGET_STAR_COUNT} selected stars, got ${selected.length}`);
  }

  // Deterministic ordering: Tier ascending, then brightest first, then HIP ID
  selected.sort((a, b) => a.unlockTier - b.unlockTier || a.apparentV - b.apparentV || a.hip - b.hip);

  // Serialize binary: 24-byte header + 18000 * 8-byte records
  const headerSize = 24;
  const recordSize = 8;
  const buf = Buffer.alloc(headerSize + selected.length * recordSize);

  buf.write('I14S', 0, 4, 'ascii');
  buf.writeUInt16LE(1, 4); // version = 1
  buf.writeUInt16LE(0, 6); // flags = 0
  buf.writeUInt32LE(selected.length, 8);
  buf.writeFloatLE(solDir[0], 12);
  buf.writeFloatLE(solDir[1], 16);
  buf.writeFloatLE(solDir[2], 20);

  for (let i = 0; i < selected.length; i++) {
    const s = selected[i];
    const offset = headerSize + i * recordSize;

    const raNorm180 = normalizeRa180(s.raDeg);
    const raQuant = clamp(Math.round((raNorm180 / 180) * 32767), -32767, 32767);
    const decQuant = clamp(Math.round((s.decDeg / 90) * 32767), -32767, 32767);
    const magNorm = clamp(Math.round(((8.0 - s.apparentV) / 9.5) * 255), 0, 255);
    const bvNorm = clamp(Math.round(((s.bv - -0.35) / 2.35) * 255), 0, 255);

    buf.writeInt16LE(raQuant, offset);
    buf.writeInt16LE(decQuant, offset + 2);
    buf.writeUInt8(magNorm, offset + 4);
    buf.writeUInt8(bvNorm, offset + 5);
    buf.writeUInt8(s.band, offset + 6);
    buf.writeUInt8(s.unlockTier, offset + 7);
  }

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, buf);

  // Self-verify binary layout & stats
  const tierCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  const bandCounts = { 0: 0, 1: 0, 2: 0, 3: 0 };
  for (let i = 0; i < selected.length; i++) {
    const off = headerSize + i * recordSize;
    const band = buf.readUInt8(off + 6);
    const tier = buf.readUInt8(off + 7);
    tierCounts[tier]++;
    bandCounts[band]++;
  }

  console.log(`[star-catalog] Wrote ${OUT_PATH} (${buf.length} bytes)`);
  console.log(`[star-catalog] Nearby stars (<100 ly) transformed to 10.0-ly station frame: ${transformedNearbyCount}`);
  console.log(
    `[star-catalog] Sol apparent: RA=${solEntry.raDeg.toFixed(4)}° Dec=${solEntry.decDeg.toFixed(4)}° V=${solEntry.apparentV.toFixed(3)} d=${solEntry.distFromProbeLy.toFixed(2)} ly`
  );
  console.log(
    `[star-catalog] Alpha Cen AB apparent: RA=${acenEntry.raDeg.toFixed(4)}° Dec=${acenEntry.decDeg.toFixed(4)}° V=${acenEntry.apparentV.toFixed(3)} d=${acenEntry.distFromProbeLy.toFixed(2)} ly`
  );
  let cum = 0;
  for (let t = 1; t <= 6; t++) {
    cum += tierCounts[t];
    console.log(`[star-catalog]   Tier ${t}: +${tierCounts[t]} stars (cumulative ${cum})`);
  }
  console.log(
    `[star-catalog]   Bands: UV/X-ray(0)=${bandCounts[0]}, Visible(1)=${bandCounts[1]}, Near-IR(2)=${bandCounts[2]}, Mid-IR(3)=${bandCounts[3]}`
  );
}

main().catch((err) => {
  console.error('[star-catalog] ERROR:', err);
  process.exit(1);
});
