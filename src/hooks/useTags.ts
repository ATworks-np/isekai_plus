'use client'

import { useCallback, useEffect } from 'react'
import { getAuth } from 'firebase/auth'
import { useAtom } from 'jotai'
import User from '@/models/entities/user'
import {collection, doc, getDoc, getDocs} from 'firebase/firestore'
import { db } from '@/firebase'
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
      const response = await fetch('https://tags-1083169622055.us-central1.run.app')
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`)
      const data = await response.json()
      const result = data.reduce((acc: any, item: any) => {
        acc[item.path] = item
        return acc
      }, {})
      setTags({ ...result })
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
