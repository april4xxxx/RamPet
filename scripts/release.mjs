import { spawnSync } from 'node:child_process'

const bumpType = process.argv[2] ?? 'patch'
const releaseNote = process.argv.slice(3)

run('node', ['scripts/release-version.mjs', bumpType, ...releaseNote])
run('npm', ['run', 'dist:mac'])

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: false,
  })

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}
