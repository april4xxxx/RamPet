import sharp from 'sharp'

const source = 'references/ram-extra-states-sheet.png'
const columns = 6
const rows = 2

const states = [
  { name: 'hungry', row: 0, column: 0 },
  { name: 'eating', row: 0, column: 1 },
  { name: 'dirty', row: 0, column: 2, minPartArea: 1, allowEdgeElements: true },
  { name: 'cleaning', row: 0, column: 3 },
  { name: 'sick', row: 0, column: 4 },
  { name: 'medicine', row: 0, column: 5 },
  { name: 'sad', row: 1, column: 0 },
  { name: 'excited', row: 1, column: 1 },
  { name: 'study', row: 1, column: 2 },
  { name: 'work', row: 1, column: 3 },
  { name: 'play', row: 1, column: 4 },
  {
    name: 'affection',
    row: 1,
    column: 5,
    expand: { left: 56 },
    keepSmallParts: true,
    allowEdgeElements: true,
    discardLeftEdge: true,
  },
]

function isBackground(r, g, b) {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  return r > 218 && g > 214 && b > 205 && max - min < 34
}

function isLabel(r, g, b) {
  return r > 85 && r < 170 && g > 85 && g < 170 && b > 75 && b < 155
}

function cellBounds(state, sourceWidth, sourceHeight) {
  const cellWidth = sourceWidth / columns
  const cellHeight = sourceHeight / rows
  const left = Math.max(0, Math.floor(state.column * cellWidth) - (state.expand?.left ?? 0))
  const top = Math.max(0, Math.floor(state.row * cellHeight) - (state.expand?.top ?? 0))
  const right = Math.min(sourceWidth, Math.ceil((state.column + 1) * cellWidth) + (state.expand?.right ?? 0))
  const bottom = Math.min(sourceHeight, Math.ceil((state.row + 1) * cellHeight) + (state.expand?.bottom ?? 0))

  return {
    left,
    top,
    width: right - left,
    height: bottom - top,
  }
}

function enqueueBackground(x, y, width, height, data, channels, transparent, queue) {
  if (x < 0 || y < 0 || x >= width || y >= height) return
  const p = y * width + x
  if (transparent[p]) return
  const i = p * channels
  if (!isBackground(data[i], data[i + 1], data[i + 2])) return
  transparent[p] = 1
  queue.push([x, y])
}

function collectComponents(width, height, data, channels) {
  const visited = new Uint8Array(width * height)
  const components = []

  function collectComponent(startX, startY) {
    const pixels = []
    const stack = [[startX, startY]]
    let minX = startX
    let minY = startY
    let maxX = startX
    let maxY = startY

    visited[startY * width + startX] = 1

    while (stack.length) {
      const [x, y] = stack.pop()
      pixels.push([x, y])
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
        if (visited[p] || data[p * channels + 3] <= 8) continue
        visited[p] = 1
        stack.push([nx, ny])
      }
    }

    return { pixels, minX, minY, maxX, maxY, area: pixels.length }
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const p = y * width + x
      if (visited[p] || data[p * channels + 3] <= 8) continue
      components.push(collectComponent(x, y))
    }
  }

  return components
}

async function cutState(state) {
  const metadata = await sharp(source).metadata()
  const cropped = sharp(source).extract(cellBounds(state, metadata.width, metadata.height)).ensureAlpha()
  const { data, info } = await cropped.raw().toBuffer({ resolveWithObject: true })
  const { width, height, channels } = info
  const transparent = new Uint8Array(width * height)
  const queue = []

  for (let x = 0; x < width; x += 1) {
    enqueueBackground(x, 0, width, height, data, channels, transparent, queue)
    enqueueBackground(x, height - 1, width, height, data, channels, transparent, queue)
  }
  for (let y = 0; y < height; y += 1) {
    enqueueBackground(0, y, width, height, data, channels, transparent, queue)
    enqueueBackground(width - 1, y, width, height, data, channels, transparent, queue)
  }

  for (let head = 0; head < queue.length; head += 1) {
    const [x, y] = queue[head]
    enqueueBackground(x + 1, y, width, height, data, channels, transparent, queue)
    enqueueBackground(x - 1, y, width, height, data, channels, transparent, queue)
    enqueueBackground(x, y + 1, width, height, data, channels, transparent, queue)
    enqueueBackground(x, y - 1, width, height, data, channels, transparent, queue)
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const p = y * width + x
      const i = p * channels
      const isLabelBand = y > height * 0.66
      if (transparent[p] || (isLabelBand && isLabel(data[i], data[i + 1], data[i + 2]))) data[i + 3] = 0
    }
  }

  const components = collectComponents(width, height, data, channels)
  const mainComponent = components.reduce((largest, component) => (component.area > largest.area ? component : largest), {
    area: 0,
  })
  const keep = new Uint8Array(width * height)
  const mainCenterX = (mainComponent.minX + mainComponent.maxX) / 2

  for (const component of components) {
    const componentCenterX = (component.minX + component.maxX) / 2
    const isMain = component === mainComponent
    const isSubstantial = component.area > (state.minPartArea ?? (state.keepSmallParts ? 8 : 30))
    const allowsEdgeElements = state.allowEdgeElements
    const isBottomResidue = component.minY > height * 0.66
    const isDiscardedLeftEdge = state.discardLeftEdge && component.minX < 2 && component.maxX < width * 0.18
    const isNeighborEdge =
      !allowsEdgeElements && (component.maxX < width * 0.18 || component.minX > width * 0.82)
    const isNearMain = Math.abs(componentCenterX - mainCenterX) < width * 0.48

    if (!isMain && (!isSubstantial || isBottomResidue || isDiscardedLeftEdge || isNeighborEdge || !isNearMain)) continue

    for (const [x, y] of component.pixels) {
      keep[y * width + x] = 1
    }
  }

  let minX = width
  let minY = height
  let maxX = 0
  let maxY = 0

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const p = y * width + x
      if (!keep[p]) {
        data[p * channels + 3] = 0
        continue
      }
      if (data[p * channels + 3] <= 8) continue
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
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
