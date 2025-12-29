import { useEffect, useState } from 'react'
import { userAtom } from '@/stores/userStore'
import { getAuth } from 'firebase/auth'
import { useAtom } from 'jotai'
import { animeAtom } from "@/stores/animeStore";
import {doc, DocumentReference, getDoc} from "firebase/firestore";
import {db} from "@/firebase";
import User from "@/models/entities/user";
import Anime from "@/models/entities/anime";
import {ratingLabels} from "@/models/interfaces/ratings"

const useAnime = (props: {id: string | undefined}) => {
  const [anime, setAnime] = useAtom(animeAtom);

  useEffect(() => {
    if(!props.id) return;
    if(anime.props.id == props.id) return;
    //setAnime(Anime.createDefault());
    const animeDocRef = doc(db, 'versions/1/animes', props.id)
    getDoc(animeDocRef).then(docSnapshot => {
      const animeData = docSnapshot.data()

      if(!animeData) return false;

      const anime = new Anime({
        id: animeData.id,
        name: animeData.name,
        tagIds: animeData.tags.map((e: any)=>e.path),
        cours: animeData.cours,
        ratings: {
          story: animeData.storyRating || 0,
          character: animeData.characterRating || 0,
          animation: animeData.animationRating || 0,
          message: animeData.messageRating || 0,
          worldview: animeData.worldviewRating || 0,
        }
      })

      setAnime(anime);
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.id])

  return [anime]
}

export default useAnime;