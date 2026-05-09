import sharp from 'sharp'

const source = 'references/ram-guide-1-original.jpg'
const output = 'src/assets/ram/idle.png'
const debugCrop = 'references/middle-ram-source-crop.png'

const crop = { left: 1166, top: 526, width: 406, height: 336 }

function colorDistance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}

function isRedOrangeTextOrArrow(r, g, b) {
  return r > 135 && r > g + 22 && r > b + 34 && g < 205
}

function isPalePagePixel(r, g, b) {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  return r > 145 && g > 150 && b > 135 && max - min < 95
}

const cropped = sharp(source).extract(crop).ensureAlpha()
await cropped.png().toFile(debugCrop)

const { data, info } = await cropped.raw().toBuffer({ resolveWithObject: true })
const { width, height, channels } = info

const edgeSamples = []
for (let x = 0; x < width; x += 1) {
  for (const y of [0, height - 1]) {
    const i = (y * width + x) * channels
    edgeSamples.push([data[i], data[i + 1], data[i + 2]])
  }
}
for (let y = 0; y < height; y += 1) {
  for (const x of [0, width - 1]) {
    const i = (y * width + x) * channels
    edgeSamples.push([data[i], data[i + 1], data[i + 2]])
  }
}

const background = edgeSamples
  .reduce((sum, sample) => [sum[0] + sample[0], sum[1] + sample[1], sum[2] + sample[2]], [0, 0, 0])
  .map((value) => value / edgeSamples.length)

const transparent = new Uint8Array(width * height)
const queue = []

function enqueue(x, y) {
  if (x < 0 || y < 0 || x >= width || y >= height) return
  const p = y * width + x
  if (transparent[p]) return
  const i = p * channels
  const r = data[i]
  const g = data[i + 1]
  const b = data[i + 2]
  if (colorDistance([r, g, b], background) > 92 && !isPalePagePixel(r, g, b)) return
  transparent[p] = 1
  queue.push([x, y])
}

for (let x = 0; x < width; x += 1) {
  enqueue(x, 0)
  enqueue(x, height - 1)
}
for (let y = 0; y < height; y += 1) {
  enqueue(0, y)
  enqueue(width - 1, y)
}

for (let head = 0; head < queue.length; head += 1) {
  const [x, y] = queue[head]
  enqueue(x + 1, y)
  enqueue(x - 1, y)
  enqueue(x, y + 1)
  enqueue(x, y - 1)
}

let minX = width
let minY = height
let maxX = 0
let maxY = 0

for (let y = 0; y < height; y += 1) {
  for (let x = 0; x < width; x += 1) {
    const p = y * width + x
    const i = p * channels
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const remove = transparent[p] || isRedOrangeTextOrArrow(r, g, b)
    data[i + 3] = remove ? 0 : data[i + 3]
  }
}

const visited = new Uint8Array(width * height)
let largestComponent = []

function collectComponent(startX, startY) {
  const component = []
  const stack = [[startX, startY]]
  visited[startY * width + startX] = 1

  while (stack.length) {
    const [x, y] = stack.pop()
    component.push([x, y])

    for (const [nx, ny] of [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ]) {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
      const p = ny * width + nx
      if (visited[p]) continue
      if (data[p * channels + 3] === 0) continue
      visited[p] = 1
      stack.push([nx, ny])
    }
  }

  return component
}

for (let y = 0; y < height; y += 1) {
  for (let x = 0; x < width; x += 1) {
    const p = y * width + x
    if (visited[p] || data[p * channels + 3] === 0) continue
    const component = collectComponent(x, y)
    if (component.length > largestComponent.length) largestComponent = component
  }
}

const keep = new Uint8Array(width * height)
for (const [x, y] of largestComponent) {
  keep[y * width + x] = 1
}

for (let y = 0; y < height; y += 1) {
  for (let x = 0; x < width; x += 1) {
    const p = y * width + x
    const i = p * channels
    if (!keep[p]) {
      data[i + 3] = 0
      continue
    }
    if (data[i + 3] > 0) {
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }
}

const contentWidth = Math.max(1, maxX - minX + 1)
const contentHeight = Math.max(1, maxY - minY + 1)

const pet = sharp(data, { raw: { width, height, channels } }).extract({
  left: minX,
  top: minY,
  width: contentWidth,
  height: contentHeight,
})

await sharp({
  create: {
    width: 512,
    height: 512,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  },
})
  .composite([
    {
      input: await pet.resize({ width: 372, height: 372, fit: 'inside', kernel: 'lanczos3' }).png().toBuffer(),
      gravity: 'center',
    },
  ])
  .png()
  .toFile(output)

console.log(`Wrote ${output}`)
