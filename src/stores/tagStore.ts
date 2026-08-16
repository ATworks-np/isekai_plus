import { atom } from 'jotai'
import type { TagCatalogue } from '@/models/tagCatalogue'

export const tagsAtom = atom<TagCatalogue>({})
