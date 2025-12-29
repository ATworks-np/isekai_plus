import { atom } from 'jotai'
import Comment from '@/models/entities/comment'

export const animeCommentsAtom = atom<Comment [] | undefined>(undefined)
