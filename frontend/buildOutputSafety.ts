import { lstatSync, realpathSync, type Stats } from 'node:fs'
import { dirname, resolve } from 'node:path'

export function assertSafeBuildOutput(
  projectRoot: string,
  candidate: string,
  allowedDirectoryName: 'web' | '.e2e-web',
): void {
  const lexicalRoot = resolve(projectRoot)
  const rootStat = lstatSync(lexicalRoot)
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
    throw new Error('build output safety: project root must be a real directory, not a symlink')
  }

  const realRoot = realpathSync(lexicalRoot)
  const lexicalCandidate = resolve(candidate)
  const allowedLexicalCandidate = resolve(lexicalRoot, allowedDirectoryName)
  if (lexicalCandidate !== allowedLexicalCandidate) {
    throw new Error(`build output safety: only ${allowedDirectoryName} directly under the project root is allowed`)
  }

  const lexicalParent = dirname(lexicalCandidate)
  const parentStat = lstatSync(lexicalParent)
  if (parentStat.isSymbolicLink() || !parentStat.isDirectory()) {
    throw new Error('build output safety: output parent must be a real directory')
  }
  if (realpathSync(lexicalParent) !== realRoot) {
    throw new Error('build output safety: output parent resolves outside the project root')
  }

  let candidateStat: Stats
  try {
    candidateStat = lstatSync(lexicalCandidate)
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return
    throw cause
  }
  if (candidateStat.isSymbolicLink()) {
    throw new Error('build output safety: output directory must not be a symlink')
  }
  if (!candidateStat.isDirectory()) {
    throw new Error('build output safety: output path exists but is not a directory')
  }
  if (realpathSync(lexicalCandidate) !== resolve(realRoot, allowedDirectoryName)) {
    throw new Error('build output safety: resolved output directory is not the allowed directory')
  }
}
