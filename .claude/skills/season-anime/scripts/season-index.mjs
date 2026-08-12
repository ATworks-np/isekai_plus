/**
 * Reads data/seasons.yaml.
 *
 * A hand-rolled reader rather than a YAML dependency: the file is a flat list
 * of scalar fields written by crawl-season-index.mjs, and pulling in a parser
 * for it would be the only dependency these scripts have.
 */

import { readFileSync } from 'fs'

const DEFAULT_PATH = '.claude/skills/season-anime/data/seasons.yaml'

export const readSeasonIndex = (path = DEFAULT_PATH) => {
  const lines = readFileSync(path, 'utf8').split(/\r?\n/)
  const seasons = []
  let current = null
  let source = null

  for (const line of lines) {
    if (line.trim().startsWith('#') || !line.trim()) continue

    const top = /^source:\s*(.+)$/.exec(line)
    if (top) {
      source = top[1].trim()
      continue
    }

    const start = /^\s*-\s*cour:\s*(.+)$/.exec(line)
    if (start) {
      current = { cour: start[1].trim() }
      seasons.push(current)
      continue
    }

    const field = /^\s+([a-zA-Z]+):\s*(.+)$/.exec(line)
    if (field && current) {
      const [, key, raw] = field
      const value = raw.trim()
      current[key] = /^\d+$/.test(value) ? Number(value) : value
    }
  }

  return { source, seasons }
}

/** The season entry for a cour like "2026-Q3", or undefined. */
export const seasonForCour = (cour, path) =>
  readSeasonIndex(path).seasons.find(season => season.cour === cour)
