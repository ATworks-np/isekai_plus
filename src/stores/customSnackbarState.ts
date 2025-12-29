'use client'

import { atom } from 'jotai'
import { ICostomSnackbar } from "@/models/interfaces/costomSnackbar"

export const customSnackbarAtom = atom<string>('')
