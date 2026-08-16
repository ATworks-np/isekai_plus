'use client';

import {useEffect, useRef, useState} from 'react';
import NextImage from 'next/image';
import {
  TextField,
  Button,
  Container,
  Box,
  Card,
  FormControl,
  InputLabel,
  OutlinedInput,
  InputAdornment,
  Typography,
  Grid
} from '@mui/material';

import TagsSection from "@/components/TagsSection";
import {doc, setDoc} from "firebase/firestore";
import {ref, uploadBytes} from 'firebase/storage'
import { db, storage } from '@/firebase'
import IconButton from "@mui/material/IconButton";
import AddCircleIcon from '@mui/icons-material/AddCircle';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import useTags from "@/hooks/useTags";
import { useRouter } from 'next/navigation'
import {useAtom} from "jotai/index";
import {loadingModalAtom} from "@/stores/loadingModalState";
import {customSnackbarAtom} from "@/stores/customSnackbarState";
import useAnime from "@/hooks/useAnime";

/**
 * Edit only. Creating a work sets source ids and a season, which this form
 * never did — records added through it arrived unlinked and unratable — so
 * registration goes through the write API and the season-anime skill.
 */
type AddTitleProps = {
  id: string;
};

const AddTitle: React.FC<AddTitleProps> = ({ id }) => {
  const [thumbnail, setThumbnail] = useState<File | null>(null);
  const [titleJPDraft, setTitleJP] = useState<string | null>(null);
  const [titleENDraft, setTitleEN] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [tagsDraft, setTagsState] = useState<string[] | null>(null);
  const {tags, syncTags } = useTags();
  const router = useRouter()
  const [open, setOpen] = useAtom(loadingModalAtom)
  const [message, setMessage] = useAtom<string>(customSnackbarAtom);

  const [anime] = useAnime({id: id});

  // The fetched record shows through until a field is touched, so loading it
  // does not mean copying four values into state from an effect.
  const loaded = anime?.props?.id === id ? anime.props : undefined
  const titleJP = titleJPDraft ?? loaded?.name.ja ?? ''
  const titleEN = titleENDraft ?? loaded?.name.en ?? ''
  const tagsState = tagsDraft ?? loaded?.tagIds ?? []

  const handleSubmit = async (e: React.FormEvent) => {
    if (!titleJP) {
      setMessage('作品名を入力してください');
      return;
    }

    try {
      setOpen(true);
      // en is omitted rather than blanked when there is no translation: the
      // difference between "not translated" and "translated to nothing" is
      // what tells the site which titles still need work.
      const data = {
        name: titleEN.trim() && titleEN.trim() !== titleJP.trim()
          ? { ja: titleJP, en: titleEN.trim() }
          : { ja: titleJP },
        tags: tagsState.map((key: string) => doc(db, key)),
      };

      // merge so the ratings, seasons and metadata the form does not know about survive
      const docRef = doc(db, 'versions/1/animes', id);
      await setDoc(docRef, data, { merge: true });

      if(thumbnail){
        const [webp, smallWebp] = await Promise.all([
          convertToWebp(thumbnail),
          convertToWebp(thumbnail, 160, 0.7),
        ]);
        await Promise.all([
          uploadBytes(ref(storage, `thumbnail/${docRef.id}.webp`), webp, {
            contentType: 'image/webp',
            cacheControl: 'public, max-age=31536000, immutable',
          }),
          uploadBytes(ref(storage, `thumbnail/${docRef.id}-small.webp`), smallWebp, {
            contentType: 'image/webp',
            cacheControl: 'public, max-age=31536000, immutable',
          }),
        ]);
      }

      setOpen(false);
      setMessage(`アニメを更新しました`);
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

  const convertToWebp = (
    file: File,
    maxWidth?: number,
    quality = 0.85
  ): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = maxWidth ? Math.min(maxWidth, img.width) : img.width;
        canvas.height = Math.round(img.height * (canvas.width / img.width));
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject('Canvas context is null');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject('Blob conversion failed');
        }, 'image/webp', quality);
      };
      img.onerror = (err) => reject(err);
      img.src = URL.createObjectURL(file);
    });
  };


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
            <NextImage
              src={imageUrl}
              alt="選択したサムネイルのプレビュー"
              width={400}
              height={400}
              unoptimized
              style={{ width: '50%', height: 'auto' }}
            />
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
          label="作品名 (EN・任意)"
          variant="outlined"
          fullWidth
          margin="normal"
          value={titleEN}
          onChange={(e) => setTitleEN(e.target.value)}
        />
        <TagsSection tagsState={tagsState} setTagsState={setTagsState} />

        {/* Tags are picked from the dictionary, never invented here. The two
            blocks that used to sit below let this screen create a tag document
            straight from a text field, or from whatever an OpenAI call returned —
            writing name.en as a copy of name.ja and leaving group and criteria
            empty. That is how アルケミスト came to exist twice, once with each width
            of parenthesis. Tags are proposed by scripts/suggest-tags.mjs, which
            chooses from the closed vocabulary and has to quote a source, and new
            entries are made on the tag admin screen, where a group and a criteria
            are required. */}
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
