'use client'

import { useEffect, useState } from 'react'
import { getAuth } from 'firebase/auth'
import { useAtom } from 'jotai'
import User from '@/models/entities/user'
import {collection, doc, getDoc, getDocs} from 'firebase/firestore'
import { db } from '@/firebase'
import {tagsAtom} from "@/store/tagStore";

const useTags = () => {
  const [tags, setTags] = useAtom(tagsAtom)
  useEffect(() => {
    if(Object.keys(tags).length !== 0) return;
    syncTags();
  }, [])

  const syncTags = () => {
    fetch('https://tags-1083169622055.us-central1.run.app')
      .then((response) => {
        if (!response.ok) {
          // レスポンスがエラーの場合の処理
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json(); // JSON をパース
      })
      .then((data) => {
        const result = data.reduce((acc: any, item: any) => {
          acc[item.path] = item;
          return acc;
        }, {});
        setTags({...result});
      })
      .catch((error) => {
        // エラー処理
        console.error("データ取得中にエラーが発生しました:", error);
      });
  }

  return { tags, syncTags }
}

export default useTags
