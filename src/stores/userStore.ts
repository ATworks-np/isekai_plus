import { atom } from 'jotai'
import User from '@/models/entities/user'

export const userAtom = atom<User>(
  new User({
    uid: undefined,
    displayName: null,
    token: '',
    type: undefined,
    photoURL: '',
  })
)
