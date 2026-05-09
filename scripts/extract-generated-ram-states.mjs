import sharp from 'sharp'

const source = 'references/ram-states-no-feet-sheet.png'

const states = [
  { name: 'idle', left: 10, top: 165, width: 315, height: 385 },
  { name: 'happy', left: 365, top: 150, width: 315, height: 385 },
  { name: 'walk-1', left: 710, top: 175, width: 315, height: 385 },
  { name: 'walk-2', left: 1000, top: 175, width: 345, height: 385 },
  { name: 'sleep', left: 1348, top: 145, width: 342, height: 415 },
  { name: 'carried', left: 1680, top: 170, width: 315, height: 390 },
]

function isBackground(r, g, b) {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  return r > 218 && g > 214 && b > 205 && max - min < 34
}

function enqueue(x, y, width, height, data, channels, transparent, queue) {
  if (x < 0 || y < 0 || x >= width || y >= height) return
  const p = y * width + x
  if (transparent[p]) return
  const i = p * channels
  if (!isBackground(data[i], data[i + 1], data[i + 2])) return
  transparent[p] = 1
  queue.push([x, y])
}

async function cutState(state) {
  const cropped = sharp(source).extract(state).ensureAlpha()
  const { data, info } = await cropped.raw().toBuffer({ resolveWithObject: true })
  const { width, height, channels } = info
  const transparent = new Uint8Array(width * height)
  const queue = []

  for (let x = 0; x < width; x += 1) {
    enqueue(x, 0, width, height, data, channels, transparent, queue)
    enqueue(x, height - 1, width, height, data, channels, transparent, queue)
  }
  for (let y = 0; y < height; y += 1) {
    enqueue(0, y, width, height, data, channels, transparent, queue)
    enqueue(width - 1, y, width, height, data, channels, transparent, queue)
  }

  for (let head = 0; head < queue.length; head += 1) {
    const [x, y] = queue[head]
    enqueue(x + 1, y, width, height, data, channels, transparent, queue)
    enqueue(x - 1, y, width, height, data, channels, transparent, queue)
    enqueue(x, y + 1, width, height, data, channels, transparent, queue)
    enqueue(x, y - 1, width, height, data, channels, transparent, queue)
  }

  let minX = width
  let minY = height
  let maxX = 0
  let maxY = 0

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const p = y * width + x
      const i = p * channels
      if (transparent[p]) data[i + 3] = 0
      if (data[i + 3] > 8) {
        minX = Math.min(minX, x)
        minY = Math.min(minY, y)
        maxX = Math.max(maxX, x)
        maxY = Math.max(maxY, y)
      }
    }
  }

  const content = sharp(data, { raw: { width, height, channels } }).extract({
    left: minX,
    top: minY,
    width: Math.max(1, maxX - minX + 1),
    height: Math.max(1, maxY - minY + 1),
  })

  const sprite = await content.resize({ width: 420, height: 420, fit: 'inside', kernel: 'lanczos3' }).png().toBuffer()

  await sharp({
    create: {
      width: 512,
      height: 512,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: sprite, gravity: 'center' }])
    .png()
    .toFile(`src/assets/ram/${state.name}.png`)

  console.log(`Wrote src/assets/ram/${state.name}.png`)
}

for (const state of states) {
  await cutState(state)
}
