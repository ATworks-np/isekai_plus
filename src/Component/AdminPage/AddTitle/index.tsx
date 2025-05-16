'use client';

import {useEffect, useRef, useState} from 'react';
import {
  TextField,
  Button,
  Container,
  Box,
  Card,
  FormControl,
  InputLabel,
  OutlinedInput,
  InputAdornment
} from '@mui/material';
import TagsSection from "@/Component/TagsSection";
import {collection, addDoc, doc, setDoc} from "firebase/firestore";
import {ref, uploadBytes, getDownloadURL, getBlob} from 'firebase/storage'
import { db, storage } from '@/firebase'
import IconButton from "@mui/material/IconButton";
import AddCircleIcon from '@mui/icons-material/AddCircle';
import useTags from "@/hooks/useTags";
import { useRouter } from 'next/navigation'
import {useAtom} from "jotai/index";
import {loadingModalAtom} from "@/store/loadingModalState";
import {customSnackbarAtom} from "@/store/customSnackbarState";
import useAnime from "@/hooks/useAnime";

type AddTitleProps = {
  id: string | undefined;
};

const AddTitle: React.FC<AddTitleProps> = ({ id }) => {
  const [thumbnail, setThumbnail] = useState<File | null>(null);
  const [titleJP, setTitleJP] = useState<string>('');
  const [titleEN, setTitleEN] = useState<string>('');
  const [cours, setCours] = useState<string>('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [tagsState, setTagsState] = useState<string[]>([]);
  const [newTag, setNewTag] = useState<{ [key:string]: string }>({});
  const {tags, syncTags } = useTags();
  const router = useRouter()
  const [open, setOpen] = useAtom(loadingModalAtom)
  const [message, setMessage] = useAtom<string>(customSnackbarAtom);

  const [anime] = useAnime({id: id});

  useEffect(() => {
    if (!id || !anime || !anime.props) return;

    setTitleJP(anime.props.name.ja);
    setTitleEN(anime.props.name.en);
    setCours(anime.props.cours.join(','));
    setTagsState(anime.props.tagIds);

  }, [anime])

  const handleSubmit = async (e: React.FormEvent) => {
    if (id && !titleJP || !titleEN || (!id && !thumbnail)) {
      alert('すべてのフィールドを入力してください');
      return;
    }

    try {
      setOpen(true);
      const data = {
        name: {
          ja: titleJP,
          en: titleEN,
        },
        cours: cours.split(','),
        tags: tagsState.map((key) => doc(db, key)),
      };

      let docRef;
      if (id) {
        // update（存在するidで上書き）
        docRef = doc(db, 'versions/1/animes', id);
        await setDoc(docRef, data, { merge: true }); // merge: true で既存の値を保持
      } else {
        // 新規追加
        docRef = await addDoc(collection(db, 'versions/1/animes'), data);
      }

      if(thumbnail){
        const ext = thumbnail.type === 'image/webp' ? 'webp' : 'jpg';
        const altExt = ext === 'jpg' ? 'webp' : 'jpg';

        // 元ファイルをそのまま保存
        const storageRef = ref(storage, `thumbnail/${docRef.id}.${ext}`);
        await uploadBytes(storageRef, thumbnail);

        // 別フォーマットに変換して保存
        const altBlob = await convertImageFormat(
          thumbnail,
          altExt === 'jpg' ? 'image/jpeg' : 'image/webp'
        );

        const altStorageRef = ref(storage, `thumbnail/${docRef.id}.${altExt}`);
        await uploadBytes(altStorageRef, altBlob);
      }

      setOpen(false);
      setMessage(`アニメが追加されました`);
      router.push('/admin');
    } catch (error) {
      setMessage('Firestore への保存に失敗しました');
      setOpen(false);
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files ? e.target.files[0] : null;
    if (file) {
      setThumbnail(file);
      setImageUrl(URL.createObjectURL(file));
    }
  };

  const convertImageFormat = (file: File, format: 'image/jpeg' | 'image/webp'): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject('Canvas context is null');
        ctx.drawImage(img, 0, 0);
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject('Blob conversion failed');
        }, format);
      };
      img.onerror = (err) => reject(err);
      img.src = URL.createObjectURL(file);
    });
  };

  const handleAddNewTag = async (e: React.FormEvent) => {
    try {
      const docRef  = await addDoc(collection(db, 'versions/1/tags'), {
        name:newTag,
      });
      setMessage(`タグが追加されました:${docRef.id}`);
      syncTags();
      setNewTag({});
    } catch (error) {
      setMessage('Firestore への保存に失敗しました');
    }
  }

  return (
    <Container >
      <h2>Add a New Anime Title</h2>
      <form onSubmit={handleSubmit}>
        <Button
          variant="contained"
          component="label"
          fullWidth
          sx={{ marginBottom: 2 }}
        >
          サムネイル画像を選択
          <input
            type="file"
            hidden
            onChange={handleImageChange}
            accept="image/*"
          />
        </Button>
        {imageUrl && (
          <Box sx={{ marginTop: 2 }}>
            <img src={imageUrl} alt="Thumbnail" style={{ width: '50%' }} />
          </Box>
        )}
        <TextField
          label="作品名 (JP)"
          variant="outlined"
          fullWidth
          margin="normal"
          value={titleJP}
          onChange={(e) => setTitleJP(e.target.value)}
        />
        <TextField
          label="作品名 (EN)"
          variant="outlined"
          fullWidth
          margin="normal"
          value={titleEN}
          onChange={(e) => setTitleEN(e.target.value)}
        />
        <TextField
          label="放送クール"
          variant="outlined"
          fullWidth
          margin="normal"
          value={cours}
          onChange={(e) => setCours(e.target.value)}
        />
        <TagsSection tagsState={tagsState} setTagsState={setTagsState} />
        <Card
          style={{margin: '10px', padding: '10px'}}
        >
          <TextField
            label="newTagJP"
            variant="outlined"
            fullWidth
            margin="normal"
            value={newTag['ja']}
            onChange={(e) => setNewTag((prev) => ({...prev, 'ja':e.target.value}))}
          />
          <TextField
            label="newTagEN"
            variant="outlined"
            fullWidth
            margin="normal"
            value={newTag['en']}
            onChange={(e) => setNewTag((prev) => ({...prev, 'en':e.target.value}))}
          />
          <Button
            variant="outlined"
            color="primary"
            fullWidth
            onClick={handleAddNewTag}
          >
            Add New Tag
          </Button>

        </Card>
        <Button
          onClick={handleSubmit}
          variant="contained"
          color="primary"
          fullWidth
          sx={{ mt: 2 }}
        >
          Add Title
        </Button>
      </form>
    </Container>
  )
}

export default AddTitle
