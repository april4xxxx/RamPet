import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const packagePath = path.join(root, 'package.json')
const lockPath = path.join(root, 'package-lock.json')
const changelogPath = path.join(root, 'docs', 'CHANGELOG.md')

const bumpType = process.argv[2] ?? 'patch'
const releaseNote = process.argv.slice(3).join(' ').trim()

const packageJson = readJson(packagePath)
const lockJson = readJson(lockPath)
const changelog = fs.readFileSync(changelogPath, 'utf8')

const currentVersion = packageJson.version
const nextVersion = bumpVersion(currentVersion, bumpType)
const today = new Date().toISOString().slice(0, 10)

packageJson.version = nextVersion
lockJson.version = nextVersion
if (lockJson.packages?.['']) {
  lockJson.packages[''].version = nextVersion
}

fs.writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`)
fs.writeFileSync(lockPath, `${JSON.stringify(lockJson, null, 2)}\n`)
fs.writeFileSync(changelogPath, updateChangelog(changelog, nextVersion, today, releaseNote))

console.log(`Version bumped: ${currentVersion} -> ${nextVersion}`)
console.log(`Changelog updated: docs/CHANGELOG.md`)

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function bumpVersion(version, type) {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/)
  if (!match) {
    throw new Error(`Unsupported semver version: ${version}`)
  }

  const [, majorRaw, minorRaw, patchRaw] = match
  let major = Number(majorRaw)
  let minor = Number(minorRaw)
  let patch = Number(patchRaw)

  if (type === 'major') {
    major += 1
    minor = 0
    patch = 0
  } else if (type === 'minor') {
    minor += 1
    patch = 0
  } else if (type === 'patch') {
    patch += 1
  } else {
    throw new Error(`Usage: node scripts/release-version.mjs patch|minor|major [release note]`)
  }

  return `${major}.${minor}.${patch}`
}

function updateChangelog(content, version, date, note) {
  const heading = `## [${version}]`
  if (content.includes(heading)) {
    throw new Error(`docs/CHANGELOG.md already contains ${heading}`)
  }

  const marker = '---\n\n'
  const markerIndex = content.indexOf(marker)
  if (markerIndex === -1) {
    throw new Error('Could not find changelog insertion marker')
  }

  const unreleasedHeading = '## [Unreleased]'
  const unreleasedIndex = content.indexOf(unreleasedHeading, markerIndex)
  if (unreleasedIndex === -1) {
    throw new Error('Could not find ## [Unreleased] section in docs/CHANGELOG.md')
  }

  const releaseSeparator = '\n---\n\n'
  const unreleasedEnd = content.indexOf(releaseSeparator, unreleasedIndex)
  if (unreleasedEnd === -1) {
    throw new Error('Could not find end of ## [Unreleased] section')
  }

  const unreleasedBody = content
    .slice(unreleasedIndex + unreleasedHeading.length, unreleasedEnd)
    .trim()

  const releaseBody = mergeReleaseNote(unreleasedBody, note)
  const replacement = [
    emptyUnreleasedSection(),
    `## [${version}] — ${date}`,
    '',
    releaseBody,
    '',
    '---',
    '',
    '',
  ].join('\n')

  return `${content.slice(0, unreleasedIndex)}${replacement}${content.slice(unreleasedEnd + releaseSeparator.length)}`
}

function emptyUnreleasedSection() {
  return [
    '## [Unreleased]',
    '',
    '### Added',
    '',
    '### Changed',
    '',
    '### Fixed',
    '',
    '---',
    '',
  ].join('\n')
}

function mergeReleaseNote(unreleasedBody, note) {
  const fallbackNote = note || '发布新版本，保持应用版本号与 changelog 一致。'
  if (!hasActualEntries(unreleasedBody)) {
    return ['### Changed', '', `- ${fallbackNote}`].join('\n')
  }

  if (!note) {
    return unreleasedBody
  }

  if (unreleasedBody.includes('### Changed')) {
    return unreleasedBody.replace('### Changed\n', `### Changed\n\n- ${note}\n`)
  }

  return `${unreleasedBody}\n\n### Changed\n\n- ${note}`
}

function hasActualEntries(markdown) {
  return markdown
    .split('\n')
    .some((line) => line.trim().startsWith('- '))
}
