import { Buffer } from "node:buffer";
import { PNG } from "pngjs";
import fontAtlasUrl from "./assets/badge-font-atlas.png";
import fontMetrics from "./assets/badge-font-metrics.json" with { type: "json" };

type RGB = [number, number, number];
interface GlyphMetrics {
  x: number;
  y: number;
  width: number;
  height: number;
  bearingX: number;
  bearingY: number;
  advance: number;
}
interface FontMetrics {
  emSize: number;
  ascent: number;
  glyphs: Record<string, GlyphMetrics>;
}

const RENDER_SCALE = 3;
const FONT = fontMetrics as FontMetrics;
const fontData = fontAtlasUrl.slice(fontAtlasUrl.indexOf(",") + 1);
let fontAtlasPromise: Promise<PNG> | undefined;

function parsePng(data: Uint8Array): Promise<PNG> {
  return new Promise((resolve, reject) => {
    new PNG().parse(Buffer.from(data), (error, png) => {
      if (error) reject(error);
      else resolve(png);
    });
  });
}

function loadFontAtlas(): Promise<PNG> {
  fontAtlasPromise ??= parsePng(Buffer.from(fontData, "base64"));
  return fontAtlasPromise;
}

export interface RobloxAvatar {
  png: PNG;
  url: string;
}

export async function fetchRobloxAvatar(userId: string, signal?: AbortSignal): Promise<RobloxAvatar> {
  const requestSignal = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(20_000)])
    : AbortSignal.timeout(20_000);
  const thumbnailResponse = await fetch(
    `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${encodeURIComponent(userId)}&size=150x150&format=Png&isCircular=false`,
    { signal: requestSignal },
  );
  if (!thumbnailResponse.ok) throw new Error(`Roblox avatar lookup failed (HTTP ${thumbnailResponse.status}).`);
  const thumbnailData = await thumbnailResponse.json() as { data?: Array<{ imageUrl?: string }> };
  const imageUrl = thumbnailData.data?.[0]?.imageUrl;
  if (!imageUrl) throw new Error("Roblox did not return an avatar image URL.");
  if (new URL(imageUrl).protocol !== "https:") throw new Error("Roblox returned an insecure avatar image URL.");

  const imageResponse = await fetch(imageUrl, { signal: requestSignal });
  if (!imageResponse.ok) throw new Error(`Roblox avatar download failed (HTTP ${imageResponse.status}).`);
  return { png: await parsePng(new Uint8Array(await imageResponse.arrayBuffer())), url: imageUrl };
}

function packPng(png: PNG): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    png.on("data", (chunk: Buffer) => chunks.push(chunk));
    png.once("error", reject);
    png.once("end", () => resolve(Buffer.concat(chunks)));
    png.pack();
  });
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

export interface BadgeHistorySummary {
  dates: Date[];
  firstEarned: Date;
  latestEarned: Date;
  averagePerYear: number;
  durationYears: number;
  peakYear: number;
  peakYearBadges: number;
  activeYears: number;
  totalYears: number;
  last30Days: number;
  last12Months: number;
  busiestDay: Date;
  busiestDayCount: number;
  longestQuietMonths: number;
  monthsWithoutBadgesPercent: number;
}

export function summarizeBadgeHistory(badges: Array<{ addTime?: unknown }>, now = new Date()): BadgeHistorySummary | undefined {
  const dates = badges.map((badge) => new Date(String(badge.addTime))).filter((date) => Number.isFinite(date.getTime())).sort((a, b) => a.getTime() - b.getTime());
  const firstEarned = dates[0];
  const latestEarned = dates.at(-1);
  if (!firstEarned || !latestEarned) return undefined;
  const perYear = new Map<number, number>();
  const perDay = new Map<string, { date: Date; count: number }>();
  const perMonth = new Set<string>();
  let longestQuietMonths = 0;
  for (const date of dates) {
    const year = date.getUTCFullYear();
    perYear.set(year, (perYear.get(year) ?? 0) + 1);
    const day = date.toISOString().slice(0, 10);
    const currentDay = perDay.get(day) ?? { date, count: 0 };
    currentDay.count += 1;
    perDay.set(day, currentDay);
    perMonth.add(`${year}-${date.getUTCMonth()}`);
  }
  for (let index = 1; index < dates.length; index += 1) {
    const previous = dates[index - 1]!;
    const current = dates[index]!;
    const gapMonths = (current.getUTCFullYear() - previous.getUTCFullYear()) * 12 + current.getUTCMonth() - previous.getUTCMonth();
    longestQuietMonths = Math.max(longestQuietMonths, Math.max(0, gapMonths - (current.getUTCDate() < previous.getUTCDate() ? 1 : 0)));
  }
  let peakYear = firstEarned.getUTCFullYear();
  let peakYearBadges = 0;
  for (const [year, count] of perYear) {
    if (count > peakYearBadges) { peakYear = year; peakYearBadges = count; }
  }
  let busiestDay = firstEarned;
  let busiestDayCount = 0;
  for (const { date, count } of perDay.values()) {
    if (count > busiestDayCount) { busiestDay = date; busiestDayCount = count; }
  }
  const totalYears = latestEarned.getUTCFullYear() - firstEarned.getUTCFullYear() + 1;
  const durationMs = latestEarned.getTime() - firstEarned.getTime();
  const durationYears = Math.max(durationMs / (365.2425 * 86_400_000), 1 / 12);
  const totalMonths = (latestEarned.getUTCFullYear() - firstEarned.getUTCFullYear()) * 12 + latestEarned.getUTCMonth() - firstEarned.getUTCMonth() + 1;
  const cutoff30 = now.getTime() - 30 * 86_400_000;
  const cutoff12 = new Date(now);
  cutoff12.setUTCFullYear(cutoff12.getUTCFullYear() - 1);
  return {
    dates, firstEarned, latestEarned, averagePerYear: dates.length / totalYears, durationYears,
    peakYear, peakYearBadges, activeYears: perYear.size, totalYears,
    last30Days: dates.filter((date) => date.getTime() >= cutoff30 && date.getTime() <= now.getTime()).length,
    last12Months: dates.filter((date) => date.getTime() >= cutoff12.getTime() && date.getTime() <= now.getTime()).length,
    busiestDay, busiestDayCount, longestQuietMonths,
    monthsWithoutBadgesPercent: totalMonths ? Math.round((totalMonths - perMonth.size) / totalMonths * 100) : 0,
  };
}

export function discordTimestamp(date: Date, style: "t" | "T" | "d" | "D" | "f" | "F" | "R" = "D"): string {
  return `<t:${Math.floor(date.getTime() / 1000)}:${style}>`;
}

function hexColor(value: string): RGB {
  return [1, 3, 5].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16)) as RGB;
}

function pixel(png: PNG, x: number, y: number, color: RGB): void {
  if (x < 0 || y < 0 || x >= png.width / RENDER_SCALE || y >= png.height / RENDER_SCALE) return;
  for (let dx = 0; dx < RENDER_SCALE; dx += 1) {
    for (let dy = 0; dy < RENDER_SCALE; dy += 1) {
      const offset = (png.width * (y * RENDER_SCALE + dy) + x * RENDER_SCALE + dx) * 4;
      png.data[offset] = color[0];
      png.data[offset + 1] = color[1];
      png.data[offset + 2] = color[2];
      png.data[offset + 3] = 255;
    }
  }
}

function blendPixel(png: PNG, x: number, y: number, color: RGB, opacity: number): void {
  if (opacity <= 0 || x < 0 || y < 0 || x >= png.width || y >= png.height) return;
  const offset = (png.width * y + x) * 4;
  for (let channel = 0; channel < 3; channel += 1) {
    png.data[offset + channel] = Math.round(png.data[offset + channel]! * (1 - opacity) + color[channel]! * opacity);
  }
}

function fillRect(png: PNG, x: number, y: number, width: number, height: number, color: RGB): void {
  for (let px = Math.max(0, x); px < Math.min(png.width / RENDER_SCALE, x + width); px += 1) {
    for (let py = Math.max(0, y); py < Math.min(png.height / RENDER_SCALE, y + height); py += 1) pixel(png, px, py, color);
  }
}

function drawLine(png: PNG, x0: number, y0: number, x1: number, y1: number, color: RGB, thickness = 1): void {
  const halfScale = (RENDER_SCALE - 1) / 2;
  const startX = x0 * RENDER_SCALE + halfScale;
  const startY = y0 * RENDER_SCALE + halfScale;
  const endX = x1 * RENDER_SCALE + halfScale;
  const endY = y1 * RENDER_SCALE + halfScale;
  const segmentX = endX - startX;
  const segmentY = endY - startY;
  const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY;
  const radius = thickness * RENDER_SCALE / 2;
  const minX = Math.max(0, Math.floor(Math.min(startX, endX) - radius - 1));
  const maxX = Math.min(png.width - 1, Math.ceil(Math.max(startX, endX) + radius + 1));
  const minY = Math.max(0, Math.floor(Math.min(startY, endY) - radius - 1));
  const maxY = Math.min(png.height - 1, Math.ceil(Math.max(startY, endY) + radius + 1));

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const projection = segmentLengthSquared
        ? Math.max(0, Math.min(1, ((x - startX) * segmentX + (y - startY) * segmentY) / segmentLengthSquared))
        : 0;
      const distance = Math.hypot(x - (startX + projection * segmentX), y - (startY + projection * segmentY));
      const coverage = Math.max(0, Math.min(1, radius + 0.5 - distance));
      blendPixel(png, x, y, color, coverage);
    }
  }
}

function fillCircle(png: PNG, centerX: number, centerY: number, radius: number, color: RGB): void {
  for (let x = -radius; x <= radius; x += 1) {
    for (let y = -radius; y <= radius; y += 1) {
      if (x * x + y * y <= radius * radius) pixel(png, centerX + x, centerY + y, color);
    }
  }
}

function drawAvatar(png: PNG, avatar: PNG, centerX: number, centerY: number, radius: number): void {
  const outputRadius = radius * RENDER_SCALE;
  const sourceSize = Math.min(avatar.width, avatar.height);
  const sourceLeft = Math.floor((avatar.width - sourceSize) / 2);
  const sourceTop = Math.floor((avatar.height - sourceSize) / 2);
  const centerXScaled = centerX * RENDER_SCALE + (RENDER_SCALE - 1) / 2;
  const centerYScaled = centerY * RENDER_SCALE + (RENDER_SCALE - 1) / 2;
  for (let y = -outputRadius - 1; y <= outputRadius + 1; y += 1) {
    for (let x = -outputRadius - 1; x <= outputRadius + 1; x += 1) {
      const targetX = centerX * RENDER_SCALE + x;
      const targetY = centerY * RENDER_SCALE + y;
      const coverage = Math.max(0, Math.min(1, outputRadius + 0.5 - Math.hypot(targetX - centerXScaled, targetY - centerYScaled)));
      if (!coverage) continue;
      const sourceX = sourceLeft + Math.max(0, Math.min(sourceSize - 1, Math.floor(((x + outputRadius) / (outputRadius * 2)) * sourceSize)));
      const sourceY = sourceTop + Math.max(0, Math.min(sourceSize - 1, Math.floor(((y + outputRadius) / (outputRadius * 2)) * sourceSize)));
      const sourceOffset = (avatar.width * sourceY + sourceX) * 4;
      if (targetX < 0 || targetY < 0 || targetX >= png.width || targetY >= png.height) continue;
      const targetOffset = (png.width * targetY + targetX) * 4;
      const alpha = avatar.data[sourceOffset + 3]! / 255 * coverage;
      for (let channel = 0; channel < 3; channel += 1) png.data[targetOffset + channel] = Math.round(
        avatar.data[sourceOffset + channel]! * alpha + png.data[targetOffset + channel]! * (1 - alpha),
      );
      png.data[targetOffset + 3] = 255;
    }
  }
}

function glyphMetrics(character: string): GlyphMetrics {
  return FONT.glyphs[character] ?? FONT.glyphs["?"]!;
}

// Always format counts with ASCII separators. The glyph atlas has a comma but
// no locale-specific spacing glyphs, so a locale-dependent formatter would
// render thousands as "1?252".
export function formatChartCount(value: number): string {
  return value.toLocaleString("en-US");
}

function textWidth(text: string, fontSize: number): number {
  const scale = fontSize / FONT.emSize;
  return [...text].reduce((width, character) => width + glyphMetrics(character).advance * scale, 0);
}

function drawText(png: PNG, atlas: PNG, text: string, startX: number, startY: number, color: RGB, fontSize = 12): void {
  const scale = (fontSize * RENDER_SCALE) / FONT.emSize;
  const baseline = (startY + (fontSize * FONT.ascent) / FONT.emSize) * RENDER_SCALE;
  let cursorX = startX * RENDER_SCALE;
  for (const character of text) {
    const glyph = glyphMetrics(character);
    if (glyph.width && glyph.height) {
      const left = cursorX + glyph.bearingX * scale;
      const top = baseline + glyph.bearingY * scale;
      const targetWidth = Math.ceil(glyph.width * scale);
      const targetHeight = Math.ceil(glyph.height * scale);
      for (let dy = 0; dy < targetHeight; dy += 1) {
        const destinationY = Math.floor(top + dy);
        if (destinationY < 0 || destinationY >= png.height) continue;
        const sourceY = (dy + 0.5) / scale - 0.5;
        const sourceY0 = Math.max(0, Math.min(glyph.height - 1, Math.floor(sourceY)));
        const sourceY1 = Math.min(glyph.height - 1, sourceY0 + 1);
        const verticalRatio = Math.max(0, Math.min(1, sourceY - Math.floor(sourceY)));
        for (let dx = 0; dx < targetWidth; dx += 1) {
          const destinationX = Math.floor(left + dx);
          if (destinationX < 0 || destinationX >= png.width) continue;
          const sourceX = (dx + 0.5) / scale - 0.5;
          const sourceX0 = Math.max(0, Math.min(glyph.width - 1, Math.floor(sourceX)));
          const sourceX1 = Math.min(glyph.width - 1, sourceX0 + 1);
          const horizontalRatio = Math.max(0, Math.min(1, sourceX - Math.floor(sourceX)));
          const alphaAt = (x: number, y: number): number => {
            const offset = (atlas.width * (glyph.y + y) + glyph.x + x) * 4 + 3;
            return atlas.data[offset]! / 255;
          };
          const upper = alphaAt(sourceX0, sourceY0) * (1 - horizontalRatio) + alphaAt(sourceX1, sourceY0) * horizontalRatio;
          const lower = alphaAt(sourceX0, sourceY1) * (1 - horizontalRatio) + alphaAt(sourceX1, sourceY1) * horizontalRatio;
          const alpha = (upper * (1 - verticalRatio) + lower * verticalRatio);
          if (alpha <= 0) continue;
          const offset = (png.width * destinationY + destinationX) * 4;
          png.data[offset] = Math.round(png.data[offset]! * (1 - alpha) + color[0] * alpha);
          png.data[offset + 1] = Math.round(png.data[offset + 1]! * (1 - alpha) + color[1] * alpha);
          png.data[offset + 2] = Math.round(png.data[offset + 2]! * (1 - alpha) + color[2] * alpha);
        }
      }
    }
    cursorX += glyph.advance * scale;
  }
}

function dateLabel(date: Date): string {
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

function monthIndex(date: Date): number {
  return date.getUTCFullYear() * 12 + date.getUTCMonth();
}

function countTickStep(maximum: number): number {
  const roughStep = Math.max(100, maximum / 10);
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const fraction = roughStep / magnitude;
  const niceFraction = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return Math.max(100, niceFraction * magnitude);
}

export async function makeBadgeChart(
  username: string,
  badges: Array<{ addTime?: unknown }>,
  colorHex: string,
  avatar?: PNG,
  userId?: string,
): Promise<Buffer> {
  const dates = badges.map((badge) => new Date(String(badge.addTime))).sort((a, b) => a.getTime() - b.getTime());
  if (dates.some((date) => !Number.isFinite(date.getTime()))) throw new Error("Roblox returned an invalid badge award date.");
  if (!dates.length) throw new Error(`No badge award dates were available for ${username}.`);

  const fontAtlas = await loadFontAtlas();
  const width = 1000, height = 600, left = 65, right = 22;
  const plotTop = 120, plotBottom = 356, plotWidth = width - left - right;
  const plotHeight = plotBottom - plotTop;
  const barTop = 428, barBottom = 558;
  const png = new PNG({ width: width * RENDER_SCALE, height: height * RENDER_SCALE });
  const background = hexColor("#09090b");
  const grid = hexColor("#242428");
  const labelColor = hexColor("#b8b8bd");
  const lineColor = hexColor(colorHex);
  const white = hexColor("#f4f4f5");
  const muted = hexColor("#77777f");
  const markerColor = hexColor("#d4d4d8");
  for (let offset = 0; offset < png.data.length; offset += 4) {
    png.data[offset] = background[0];
    png.data[offset + 1] = background[1];
    png.data[offset + 2] = background[2];
    png.data[offset + 3] = 255;
  }

  const firstMonth = monthIndex(dates[0]!);
  const lastMonth = monthIndex(dates.at(-1)!);
  const monthlyCounts = Array.from({ length: lastMonth - firstMonth + 1 }, () => 0);
  for (const date of dates) {
    monthlyCounts[monthIndex(date) - firstMonth]! += 1;
  }
  const gaps = dates.slice(1).map((date, index) => {
    const previous = dates[index]!;
    const wholeMonths = monthIndex(date) - monthIndex(previous) - (date.getUTCDate() < previous.getUTCDate() ? 1 : 0);
    return { previous, date, index: index + 1, months: Math.max(0, wholeMonths) };
  });
  fillCircle(png, 51, 42, 24, hexColor("#1b1b20"));
  if (avatar) drawAvatar(png, avatar, 51, 42, 24);
  drawText(png, fontAtlas, username, 91, 10, white, 26);
  drawText(png, fontAtlas, `${formatChartCount(dates.length)} badges | ${dateLabel(dates[0]!)} - ${dateLabel(dates.at(-1)!)}`, 91, 49, labelColor, 14);
  const summary = summarizeBadgeHistory(badges);
  if (summary) {
    const accountId = userId ? `ID ${userId}  -  ` : "";
    const activeLabel = `${summary.activeYears} active years`;
    const peakLabel = `Peak year ${summary.peakYear} (${summary.peakYearBadges})`;
    const activity = `${accountId}${activeLabel} | ${summary.averagePerYear.toFixed(1)} badges/year | ${peakLabel}`;
    drawText(png, fontAtlas, activity, 91, 73, muted, 12);
  }

  const minTime = dates[0]!.getTime();
  const maxTime = dates.at(-1)!.getTime();
  const span = Math.max(maxTime - minTime, 1);
  const axisStep = countTickStep(dates.length);
  const axisMaximum = Math.ceil(dates.length / axisStep) * axisStep;
  const pointFor = (date: Date, count: number): [number, number] => [
    left + Math.round(((date.getTime() - minTime) / span) * plotWidth),
    plotBottom - Math.round((count / axisMaximum) * plotHeight),
  ];

  for (let count = 0; count <= axisMaximum; count += axisStep) {
    const y = plotBottom - Math.round((count / axisMaximum) * plotHeight);
    drawLine(png, left, y, width - right, y, grid);
    const label = formatChartCount(count);
    drawText(png, fontAtlas, label, left - textWidth(label, 11) - 8, y - 5, muted, 11);
  }
  drawText(png, fontAtlas, "Badges earned", left, plotTop - 20, labelColor, 12);

  const firstYear = dates[0]!.getUTCFullYear();
  const lastYear = dates.at(-1)!.getUTCFullYear();
  const yearStep = Math.max(1, Math.ceil((lastYear - firstYear) / 8));
  const years: number[] = [];
  for (let year = firstYear; year <= lastYear; year += yearStep) {
    if (year === firstYear && dates[0]!.getUTCMonth() > 0) continue;
    years.push(year);
  }
  if (years.at(-1) !== lastYear) years.push(lastYear);
  for (const year of years) {
    const time = year === firstYear ? minTime : Date.UTC(year, 0, 1);
    const x = year === firstYear ? left : left + Math.round(((time - minTime) / span) * plotWidth);
    if (x < left || x > width - right) continue;
    drawLine(png, x, plotTop, x, plotBottom, grid);
    const label = String(year);
    const labelWidth = textWidth(label, 14);
    const labelX = Math.max(left, Math.min(x - labelWidth / 2, width - right - labelWidth));
    drawText(png, fontAtlas, label, labelX, plotBottom + 8, muted, 14);
  }

  const points = dates.map((date, index) => pointFor(date, index + 1));
  const curve = new Map<number, [number, number]>();
  for (const point of points) curve.set(point[0], point);
  const curvePoints = [...curve.values()].sort((a, b) => a[0] - b[0]);
  const fillColor = lineColor.map((component, index) => Math.round(component * 0.13 + background[index]! * 0.87)) as RGB;
  for (let index = 1; index < curvePoints.length; index += 1) {
    const [x0, y0] = curvePoints[index - 1]!;
    const [x1, y1] = curvePoints[index]!;
    const distance = Math.max(1, x1 - x0);
    for (let x = x0; x <= x1; x += 1) {
      const y = Math.round(y0 + ((y1 - y0) * (x - x0)) / distance);
      fillRect(png, x, y, 1, plotBottom - y + 1, fillColor);
    }
    drawLine(png, x0, y0, x1, y1, lineColor, 3);
  }
  if (curvePoints.length === 1) {
    fillRect(png, curvePoints[0]![0], curvePoints[0]![1], 1, plotBottom - curvePoints[0]![1] + 1, fillColor);
  }

  const inactivityGaps = gaps
    .filter((item) => item.months >= 3)
    .sort((a, b) => b.months - a.months)
    .slice(0, 5)
    .sort((a, b) => points[a.index]![0] - points[b.index]![0]);
  let previousLabelEnd = left - 8;
  for (const gap of inactivityGaps) {
    const previous = points[gap.index - 1]!;
    const current = points[gap.index]!;
    const centerX = Math.round((previous[0] + current[0]) / 2);
    const centerY = Math.max(plotTop + 12, Math.min(plotBottom - 12, Math.round((previous[1] + current[1]) / 2) - 12));
    const text = `${gap.months} months without badges`;
    const labelWidth = textWidth(text, 10);
    const x = Math.max(left, Math.min(centerX - Math.floor(labelWidth / 2), width - right - labelWidth));
    if (x < previousLabelEnd + 8) continue;
    previousLabelEnd = x + labelWidth;
    fillRect(png, x - 3, centerY - 2, labelWidth + 6, 15, hexColor("#29292e"));
    drawText(png, fontAtlas, text, x, centerY, labelColor, 10);
    fillCircle(png, previous[0], previous[1], 2, markerColor);
    fillCircle(png, current[0], current[1], 2, markerColor);
  }
  drawText(png, fontAtlas, "Badges earned per month", left, 394, labelColor, 14);
  drawLine(png, left, barBottom, width - right, barBottom, grid);
  const maxMonthlyCount = Math.max(...monthlyCounts);
  const monthWidth = plotWidth / monthlyCounts.length;
  const barWidth = Math.max(1, Math.min(12, Math.floor(monthWidth * 0.62)));
  for (const [month, count] of monthlyCounts.entries()) {
    const centerX = left + Math.round((month + 0.5) * monthWidth);
    if (count > 0) {
      const barHeight = Math.max(2, Math.round((count / maxMonthlyCount) * (barBottom - barTop)));
      fillRect(png, centerX - Math.floor(barWidth / 2), barBottom - barHeight, barWidth, barHeight, lineColor);
    }
    const date = new Date(Date.UTC(dates[0]!.getUTCFullYear(), dates[0]!.getUTCMonth() + month, 1));
    if (date.getUTCMonth() === 0 || month === 0) {
      const label = String(date.getUTCFullYear());
      const labelWidth = textWidth(label, 11);
      drawText(png, fontAtlas, label, centerX - Math.floor(labelWidth / 2), barBottom + 5, muted, 11);
    }
  }
  return packPng(png);
}
