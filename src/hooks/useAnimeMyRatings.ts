import { useEffect, useState } from 'react'
import {baseRatings, IRatings, ratingLabels} from "@/models/interfaces/ratings"
import {api} from "@/Routes/routs";

const useAnimeMyRatings = (props: {id: string, token: string | undefined}) => {
  const [myRatings, setMyRatings] = useState<IRatings>(baseRatings)

  useEffect(() => {
    if(props.id == '' || props.token == '' || !props.token) return;
    fetch(api.animes+`/${props.id}/my_ratings`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${props.token}`,
      }
    })
      .then((response) => {
        if (!response.ok) {
          // レスポンスがエラーの場合の処理
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json(); // JSON をパース
      })
      .then((data) => {
        setMyRatings(data);
      })
      .catch((error) => {
        // エラー処理
        console.error("データ取得中にエラーが発生しました:", error);
      });
    }, [props.id, props.token]);

  return myRatings;
}

export default useAnimeMyRatings;