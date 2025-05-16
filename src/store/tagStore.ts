import { atom } from 'jotai'
import { ITag } from '@/models/entities/tag'

export const tagsAtom = atom<Record<string, ITag>>({})