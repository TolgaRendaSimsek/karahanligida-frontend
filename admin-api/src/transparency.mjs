import sharp from "sharp";

// Background removal is deliberately conservative. A connected, neutral-white
// edge is treated as packaging background; white areas surrounded by product
// pixels are never removed.
export const DEFAULT_EDGE_THRESHOLD = 0.85;

function median(values) {
  if (!values.length) return 255;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function edgeStats(data, width, height, channels, edgeWidth = 4) {
  let edge = 0;
  let neutral = 0;
  const reds = [];
  const greens = [];
  const blues = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (x >= edgeWidth && x < width - edgeWidth && y >= edgeWidth && y < height - edgeWidth) continue;
      const index = (y * width + x) * channels;
      const red = data[index];
      const green = data[index + 1];
      const blue = data[index + 2];
      const spread = Math.max(red, green, blue) - Math.min(red, green, blue);
      const average = (red + green + blue) / 3;
      edge += 1;
      if (spread <= 18 && average >= 220) neutral += 1;
      if (spread <= 36 && average >= 198) {
        reds.push(red);
        greens.push(green);
        blues.push(blue);
      }
    }
  }
  return {
    neutralRatio: edge ? neutral / edge : 0,
    background: [median(reds), median(greens), median(blues)],
  };
}

function removeConnectedLightBackground(data, width, height, background) {
  const pixels = width * height;
  const removed = new Uint8Array(pixels);
  const queued = new Uint8Array(pixels);
  const queue = new Int32Array(pixels);
  let head = 0;
  let tail = 0;

  function qualifies(pixel) {
    const index = pixel * 4;
    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];
    const spread = Math.max(red, green, blue) - Math.min(red, green, blue);
    const average = (red + green + blue) / 3;
    const distance = Math.sqrt(
      (red - background[0]) ** 2
      + (green - background[1]) ** 2
      + (blue - background[2]) ** 2,
    );
    return average >= 202 && spread <= 48 && distance <= 110;
  }

  function enqueue(pixel) {
    if (queued[pixel] || !qualifies(pixel)) return;
    queued[pixel] = 1;
    queue[tail] = pixel;
    tail += 1;
  }

  for (let x = 0; x < width; x += 1) {
    enqueue(x);
    enqueue((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y += 1) {
    enqueue(y * width);
    enqueue(y * width + width - 1);
  }

  while (head < tail) {
    const pixel = queue[head];
    head += 1;
    removed[pixel] = 1;
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    if (x > 0) enqueue(pixel - 1);
    if (x < width - 1) enqueue(pixel + 1);
    if (y > 0) enqueue(pixel - width);
    if (y < height - 1) enqueue(pixel + width);
  }

  let transparent = 0;
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    const alphaIndex = pixel * 4 + 3;
    if (removed[pixel]) {
      data[alphaIndex] = 0;
      transparent += 1;
      continue;
    }
    // Soften only the one-pixel fringe next to removed background. This avoids
    // a white halo while retaining the product contour and internal whites.
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    const touchesBackground = (x > 0 && removed[pixel - 1])
      || (x < width - 1 && removed[pixel + 1])
      || (y > 0 && removed[pixel - width])
      || (y < height - 1 && removed[pixel + width]);
    if (touchesBackground) data[alphaIndex] = Math.min(data[alphaIndex], 220);
  }
  return transparent / pixels;
}

/**
 * Analyze an image and return an alpha-preserving raw buffer. `safe` is true
 * only when a neutral-white area reaches the edges and removal changes a
 * meaningful but not almost-total part of the image.
 */
export async function prepareTransparentBuffer(input, { edgeThreshold = DEFAULT_EDGE_THRESHOLD } = {}) {
  const sample = await sharp(input, { failOn: "error", limitInputPixels: 40_000_000 })
    .rotate()
    .resize(160, 160, { fit: "fill" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const stats = edgeStats(sample.data, sample.info.width, sample.info.height, sample.info.channels);
  if (stats.neutralRatio < edgeThreshold) {
    return { safe: false, status: "review", edgeNeutralRatio: stats.neutralRatio, transparency: 0, background: stats.background };
  }

  const raw = await sharp(input, { failOn: "error", limitInputPixels: 40_000_000 })
    .rotate()
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const transparency = removeConnectedLightBackground(
    raw.data,
    raw.info.width,
    raw.info.height,
    stats.background,
  );
  if (transparency < 0.01 || transparency > 0.92) {
    return { safe: false, status: "review", edgeNeutralRatio: stats.neutralRatio, transparency, background: stats.background };
  }
  return {
    safe: true,
    status: "transparent",
    edgeNeutralRatio: stats.neutralRatio,
    transparency,
    background: stats.background,
    raw,
  };
}

export async function encodeProductBuffers(prepared, input, { quality = 92 } = {}) {
  const source = prepared.safe
    ? sharp(prepared.raw.data, {
      raw: {
        width: prepared.raw.info.width,
        height: prepared.raw.info.height,
        channels: 4,
      },
    })
    : sharp(input, { failOn: "error", limitInputPixels: 40_000_000 }).rotate().ensureAlpha();
  const full = await source
    .resize(1600, 1200, { fit: "inside", withoutEnlargement: true })
    .webp({ quality, alphaQuality: 100, effort: 5 })
    .toBuffer();
  const thumbnail = await sharp(full)
    .resize(480, 360, { fit: "contain", withoutEnlargement: false })
    .webp({ quality: Math.max(75, quality - 8), alphaQuality: 100, effort: 5 })
    .toBuffer();
  return { full, thumbnail };
}
