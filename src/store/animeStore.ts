import { atom } from 'jotai'
import Anime from "@/models/entities/anime";

export const animeAtom = atom<Anime>(Anime.createDefault())
