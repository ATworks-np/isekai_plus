'use client'

import { useCallback, useEffect } from 'react'
import { useAtom } from 'jotai'
import {tagsAtom} from "@/stores/tagStore";

/**
 * Tags are global state in an atom, so the initial fetch belongs to the module
 * rather than to whichever component mounted first. Guarding on the atom's
 * contents instead would mean depending on the very value the fetch fills.
 */
let started = false

const useTags = () => {
  const [tags, setTags] = useAtom(tagsAtom)

  const syncTags = useCallback(async () => {
    try {
      const response = await fetch('/api/v1/tags/')
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`)
      // Already keyed by document path, which is how a work stores its tags.
      setTags(await response.json())
    } catch (error) {
      console.error("データ取得中にエラーが発生しました:", error)
    }
  }, [setTags])

  useEffect(() => {
    if (started) return
    started = true
    syncTags()
  }, [syncTags])

  return { tags, syncTags }
}

export default useTags
