'use client'

import useUser from '@/hooks/useUser'
import React, {useEffect, useState} from 'react'
import AuthGurd from "@/components/AuthGurd";
import {Box, Button, Container, TextField} from "@mui/material";
import {serverTimestamp , doc, updateDoc} from "firebase/firestore";
import {db, storage} from "@/firebase";
import {ref, uploadBytes, getDownloadURL} from "firebase/storage";
import AccountCircleIcon from "@mui/icons-material/AccountCircle";
import { useAtom } from "jotai";
import {loadingModalAtom} from "@/stores/loadingModalState";
import {customSnackbarAtom} from "@/stores/customSnackbarState";
const AccountPage: React.FC = () => {
  const [open, setOpen] = useAtom<boolean>(loadingModalAtom)
  const [message, setMessage] = useAtom<string>(customSnackbarAtom)

  const { user, setUser,refreshUserData } = useUser()
  const [name, setName] = React.useState(user.props.displayName)
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoExt, setPhotoExt] = useState<string | undefined>(undefined);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    if(!user.props.uid) return;
    setOpen(true)
    try {
      const userDocRef = doc(db, "versions/1/users", user.props.uid);

      if (photo) {
        const storageRef = ref(storage, `users/photos/${user.props.uid}.${photoExt}`);
        await uploadBytes(storageRef, photo);
        const downloadURL = await getDownloadURL(storageRef)
        await updateDoc(userDocRef, { displayName: name, photoURL: downloadURL, updatedAt: serverTimestamp()});
      }else{
        await updateDoc(userDocRef, { displayName: name, updatedAt: serverTimestamp()});
      }

      await refreshUserData();
      setOpen(false);
      setMessage('保存しました')
    } catch (error) {
      console.error('Firestore への保存に失敗しました', error);
      setOpen(false);
      setMessage('保存に失敗しました')
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files ? e.target.files[0] : null;
    if (file) {
      setPhoto(file);

      const fileExtension = file.name.split('.').pop();
      setPhotoExt(fileExtension);

      setImageUrl(URL.createObjectURL(file));
    }
  };

  useEffect(() => {
    if (user.props.photoURL) {
      setImageUrl(user.props.photoURL);
    }
  }, [user]);

  return <>
    <Container style={{marginTop: '50px'}}>
      {imageUrl ? (
        <Box
          component="img"
          src={imageUrl}
          alt="Avatar"
          sx={{
            width: 100,
            height: 100,
            borderRadius: '50%',
            mt: 2,
            objectFit: 'cover',
          }}
        />
      ) : (
        <AccountCircleIcon sx={{width: 100, height: 100, mt: 2, color: 'gray'}}/>
      )}
      <input
        accept="image/*"
        type="file"
        onChange={handleImageChange}
        style={{display: 'none'}}
        id="avatar-upload"
      />
      <label htmlFor="avatar-upload">
        <Button variant="contained" color="primary" component="span" fullWidth sx={{mt: 2}}>
          アイコン画像を選択
        </Button>
      </label>
      <TextField
        label="表示名"
        variant="outlined"
        fullWidth
        margin="normal"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <Button
        onClick={handleSubmit}
        variant="contained"
        color="primary"
        fullWidth
        sx={{mt: 2}}
      >
        Save
      </Button>
    </Container>
  </>
}

export default AccountPage
