'use client'

import { useCallback, useEffect } from 'react'
import { useAtom } from 'jotai'
import {tagsAtom} from "@/stores/tagStore";

let initialRequestStarted = false

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
    // The top page hydrates this atom from its server-rendered tag catalogue.
    // Other pages still fall back to the API when they have no initial data.
    if (Object.keys(tags).length > 0 || initialRequestStarted) return
    initialRequestStarted = true
    void syncTags()
  }, [syncTags, tags])

  return { tags, syncTags }
}

export default useTags
