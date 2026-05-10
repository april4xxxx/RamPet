import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const changelogPath = path.join(root, 'docs', 'CHANGELOG.md')
const outputPath = process.argv[2] ?? path.join(root, 'release-notes.md')
const rawRef = process.env.GITHUB_REF_NAME ?? process.argv[3] ?? ''
const version = rawRef.replace(/^v/, '') || readPackageVersion()
const changelog = fs.readFileSync(changelogPath, 'utf8')

const headingPattern = new RegExp(`^## \\[${escapeRegExp(version)}\\].*$`, 'm')
const match = changelog.match(headingPattern)

if (!match || match.index === undefined) {
  throw new Error(`Could not find changelog section for ${version}`)
}

const sectionStart = match.index + match[0].length
const rest = changelog.slice(sectionStart)
const nextSection = rest.search(/^---$/m)
const body = (nextSection === -1 ? rest : rest.slice(0, nextSection)).trim()

if (!body) {
  throw new Error(`Changelog section for ${version} is empty`)
}

fs.writeFileSync(outputPath, `${body}\n`)
console.log(`Release notes written for ${version}: ${outputPath}`)

function readPackageVersion() {
  const packagePath = path.join(root, 'package.json')
  return JSON.parse(fs.readFileSync(packagePath, 'utf8')).version
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
