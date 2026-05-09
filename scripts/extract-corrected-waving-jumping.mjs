import sharp from 'sharp'

const source = 'references/ram-waving-jumping-corrected.png'

const states = [
  { name: 'waving', left: 120, top: 170, width: 780, height: 620, keepSmallParts: true },
  { name: 'jumping', left: 940, top: 90, width: 780, height: 700, keepSmallParts: true },
]

function isBackground(r, g, b) {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  return r > 218 && g > 214 && b > 205 && max - min < 34
}

function isLabel(r, g, b) {
  return r > 90 && r < 165 && g > 90 && g < 165 && b > 80 && b < 150
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
      if (transparent[p] || isLabel(data[i], data[i + 1], data[i + 2])) data[i + 3] = 0
    }
  }

  const visited = new Uint8Array(width * height)
  const components = []

  function collectComponent(startX, startY) {
    const component = []
    const stack = [[startX, startY]]
    let minX = startX
    let minY = startY
    let maxX = startX
    let maxY = startY

    visited[startY * width + startX] = 1

    while (stack.length) {
      const [x, y] = stack.pop()
      component.push([x, y])
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)

      for (const [nx, ny] of [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
      ]) {
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
        const p = ny * width + nx
        if (visited[p]) continue
        if (data[p * channels + 3] <= 8) continue
        visited[p] = 1
        stack.push([nx, ny])
      }
    }

    return { pixels: component, minX, minY, maxX, maxY, area: component.length }
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const p = y * width + x
      if (visited[p] || data[p * channels + 3] <= 8) continue
      const component = collectComponent(x, y)
      components.push(component)
    }
  }

  const largestComponent = components.reduce((largest, component) => (component.area > largest.area ? component : largest), {
    area: 0,
  })
  const keep = new Uint8Array(width * height)
  for (const component of components) {
    const isMain = component === largestComponent
    const isBottomLabelResidue = component.minY > height * 0.68
    const isSmallMotionPart = state.keepSmallParts && component.area > 12 && !isBottomLabelResidue

    if (!isMain && !isSmallMotionPart) continue

    for (const [x, y] of component.pixels) {
      keep[y * width + x] = 1
    }
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const p = y * width + x
      const i = p * channels
      if (!keep[p]) {
        data[i + 3] = 0
        continue
      }
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
