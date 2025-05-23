import { useEffect, useState } from 'react'
import { animeCommentsAtom } from "@/store/animeCommentsAtom";
import { useAtom } from 'jotai'
import {collection, getDocs} from "firebase/firestore";
import {db} from "@/firebase";
import Comment from "@/models/entities/comment";
import {date2YYYYMMDD} from "@/utils/date";
const useAnimeComments = (props: {id: string}) => {
  const [animeComments, setAnimeComments] = useAtom(animeCommentsAtom);

  const refreshAnimeComments = () => {
    // Don't set to undefined before fetching to prevent flashing
    const collectionRef = collection(db, `versions/1/animes/${props.id}/comments`)
    getDocs(collectionRef).then((querySnapshot: any) => {
      const buffer: any[] = []
      querySnapshot.docs.forEach((doc: any) => {
        const data = doc.data();
        buffer.push(new Comment(
          {
            comment: data.comment,
            date: date2YYYYMMDD(data.createdAt.toDate()),
            name: data.userDisplayName,
            avatarUrl: data.userPhotoURL,
            uid: data.uid,
            docId: doc.id,
          }
        ));
      })
      setAnimeComments(buffer);
    })
  }

  useEffect(() => {
    refreshAnimeComments();
  }, [props.id]);

  return {animeComments, refreshAnimeComments};
}

export default useAnimeComments;
