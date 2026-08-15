import { useCallback, useEffect, useState } from 'react'
import { animeCommentsAtom } from "@/stores/animeCommentsAtom";
import { useAtom } from 'jotai'
import {collection, getDocs} from "firebase/firestore";
import {db} from "@/firebase";
import Comment from "@/models/entities/comment";
import {date2YYYYMMDD} from "@/utils/date";
const useAnimeComments = (props: {id: string}) => {
  const [animeComments, setAnimeComments] = useAtom(animeCommentsAtom);
  // The comments themselves are kept across a refresh so the list does not
  // flash, but the first load has nothing to show and must say so: without
  // this the page reads "コメントはまだありません" while it is still fetching.
  const [loading, setLoading] = useState<boolean>(true);

  const refreshAnimeComments = useCallback(() => {
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
            seasonId: data.seasonId,
          }
        ));
      })
      setAnimeComments(buffer);
      setLoading(false);
    }).catch((error: unknown) => {
      console.error('コメントの取得に失敗しました', error);
      setLoading(false);
    })
  }, [props.id, setAnimeComments])

  useEffect(() => {
    refreshAnimeComments();
  }, [refreshAnimeComments]);

  return {animeComments, loading, refreshAnimeComments};
}

export default useAnimeComments;
