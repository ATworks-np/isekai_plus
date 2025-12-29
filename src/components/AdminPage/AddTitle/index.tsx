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
  InputAdornment,
  Chip,
  Typography,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Grid
} from '@mui/material';

// Type definitions for OpenAI API
type OpenAIMessageContent = 
  | string 
  | Array<{
      type: string;
      text?: string;
      image_url?: { url: string };
    }>;

type OpenAIMessage = {
  role: 'system' | 'user' | 'assistant';
  content: OpenAIMessageContent;
};

// Specific message types for different content formats
type OpenAITextMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

type OpenAIMultiModalMessage = {
  role: 'system' | 'user' | 'assistant';
  content: Array<{
    type: string;
    text?: string;
    image_url?: { url: string };
  }>;
};
import { getTagGenerationSystemPrompt, getTagGenerationUserPrompt } from '@/prompts/tagGeneration';
import TagsSection from "@/components/TagsSection";
import {collection, addDoc, doc, setDoc} from "firebase/firestore";
import {ref, uploadBytes, getDownloadURL, getBlob} from 'firebase/storage'
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
  const [generatedTags, setGeneratedTags] = useState<string[]>([]);
  const [isGeneratingTags, setIsGeneratingTags] = useState<boolean>(false);
  const [tagsModalOpen, setTagsModalOpen] = useState<boolean>(false);
  const [selectedModalTags, setSelectedModalTags] = useState<string[]>([]);
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
      setMessage('すべてのフィールドを入力してください');
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
        tags: tagsState.map((key: string) => doc(db, key)),
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
      const docRef = await addDoc(collection(db, 'versions/1/tags'), {
        name:newTag,
      });

      // Store the path of the newly created tag
      const newTagPath = docRef.path;

      setMessage(`タグが追加されました:${docRef.id}`);

      // Add the new tag to tagsState immediately using its path
      setTagsState(prev => [...prev, newTagPath]);

      // Also sync tags to update the global tags state
      syncTags();

      setNewTag({});
    } catch (error) {
      setMessage('Firestore への保存に失敗しました');
    }
  }

  // Convert image to base64
  const imageToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  };

  const generateTags = async () => {
    if (!titleJP) {
      setMessage('タグを生成するには作品名を入力してください');
      return;
    }

    setIsGeneratingTags(true);
    setGeneratedTags([]);
    setSelectedModalTags([]);

    try {
      // Prepare messages array
      const systemMessage: OpenAITextMessage = {
        role: 'system',
        content: getTagGenerationSystemPrompt(tags)
      };

      let userMessage: OpenAITextMessage | OpenAIMultiModalMessage;

      // If thumbnail exists, convert it to base64 and add it to the messages
      if (thumbnail) {
        const base64Image = await imageToBase64(thumbnail);

        // Add user message with image
        userMessage = {
          role: 'user',
          content: [
            { type: 'text', text: getTagGenerationUserPrompt(titleJP) },
            { type: 'image_url', image_url: { url: base64Image } }
          ]
        };
      } else {
        // Add user message without image
        userMessage = {
          role: 'user',
          content: getTagGenerationUserPrompt(titleJP)
        };
      }

      // Combine messages for the API call
      const messages = [systemMessage, userMessage];

      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.NEXT_PUBLIC_OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          // model: 'gpt-4o-search-preview',
          model: "gpt-5",
            reasoning: { "effort": "low" },
            tools: [
                {
                    type: "web_search",
                }
                ],
          input: getTagGenerationSystemPrompt(tags) + "\n" +getTagGenerationUserPrompt(titleJP)
        })
      });

      if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}`);
      }

      const data = await response.json();
      const output = data.output;
      const content = data.output[output.length-1].content[0].text;

      // Extract tags from the response (format: #tag)
      const tagMatches = content.match(/#[^\s#]+/g) || [];
      const cleanTags = tagMatches.map((tag: string) => tag.substring(1).replace(/,/g, '')); // Remove # prefix and commas

      setGeneratedTags(cleanTags);

      // Open the modal to display the generated tags
      setTagsModalOpen(true);
    } catch (error) {
      console.error('Error generating tags:', error);
      setMessage('タグの生成に失敗しました');
    } finally {
      setIsGeneratingTags(false);
    }
  }

  const handleTagSelect = (tag: string) => {
    // Toggle selection of a tag in the modal
    setSelectedModalTags(prev => 
      prev.includes(tag) 
        ? prev.filter(t => t !== tag) 
        : [...prev, tag]
    );
  };

  const handleAddSelectedTags = async () => {
    if (selectedModalTags.length === 0) {
      setMessage('タグが選択されていません');
      return;
    }

    // Process each selected tag
    for (const tag of selectedModalTags) {
      // Find if this tag already exists in the system
      const existingTagKey = Object.entries(tags).find(
        ([_, tagObj]) => tagObj.name.ja === tag || tagObj.name.en === tag
      )?.[0];

      if (existingTagKey) {
        // If tag exists and not already selected, add it to selected tags
        if (!tagsState.includes(existingTagKey)) {
          setTagsState(prev => [...prev, existingTagKey]);
        }
      } else {
        // If tag doesn't exist, create a new one
        try {
          const newTagData = {
            ja: tag,
            en: tag // Using the same value for both languages as a default
          };

          const docRef = await addDoc(collection(db, 'versions/1/tags'), {
            name: newTagData,
          });

          // Store the path of the newly created tag
          const newTagPath = docRef.path;

          // Add the new tag to tagsState immediately using its path
          setTagsState(prev => [...prev, newTagPath]);
        } catch (error) {
          console.error('Error adding new tag:', error);
          setMessage('タグの追加に失敗しました');
        }
      }
    }

    // Sync tags to update the global tags state
    syncTags();

    // Show success message
    setMessage(`${selectedModalTags.length}個のタグを追加しました`);

    // Close the modal
    setTagsModalOpen(false);
  };

  const handleCloseTagsModal = () => {
    setTagsModalOpen(false);
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

        {/* Tag Generation Section */}
        <Card style={{margin: '10px', padding: '10px', marginBottom: '20px'}}>
          <Typography variant="h6" gutterBottom>
            タグを自動生成
          </Typography>
          <Button
            variant="contained"
            color="primary"
            fullWidth
            onClick={generateTags}
            disabled={isGeneratingTags || !titleJP}
            sx={{ mb: 2 }}
          >
            {isGeneratingTags ? <CircularProgress size={24} color="inherit" /> : 'タグを生成する'}
          </Button>

          {generatedTags.length > 0 && (
            <Typography variant="subtitle1" color="success.main" align="center" sx={{ mt: 2 }}>
              {generatedTags.length}個のタグが生成されました
            </Typography>
          )}

          {/* Tags Selection Modal */}
          <Dialog 
            open={tagsModalOpen} 
            onClose={handleCloseTagsModal}
            maxWidth="md"
            fullWidth
          >
            <DialogTitle>タグを選択</DialogTitle>
            <DialogContent>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                追加したいタグを選択してください。選択したタグはまとめて追加されます。
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {generatedTags.map((tag: string, index: number) => {
                  // Check if tag already exists in the system
                  const existingTagKey = Object.entries(tags).find(
                    ([_, tagObj]) => tagObj.name.ja === tag || tagObj.name.en === tag
                  )?.[0];

                  // Check if tag is already selected in tagsState
                  const isAlreadySelected = existingTagKey && tagsState.includes(existingTagKey);

                  // Check if tag is selected in the modal
                  const isSelectedInModal = selectedModalTags.includes(tag);

                  return (
                    <Box key={index} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <Chip
                        label={tag}
                        color={isSelectedInModal ? 'primary' : isAlreadySelected ? 'success' : 'default'}
                        onClick={() => handleTagSelect(tag)}
                        sx={{
                          m: 0.5,
                          fontSize: '1rem',
                          opacity: isAlreadySelected ? 0.7 : 1,
                          '&:hover': { opacity: 0.9 },
                          // Ensure long tag text is fully visible inside the modal
                          maxWidth: '100%',
                          height: 'auto',
                          alignItems: 'flex-start',
                          whiteSpace: 'normal',
                          '& .MuiChip-label': {
                            whiteSpace: 'normal',
                            overflow: 'visible',
                            textOverflow: 'clip',
                            display: 'block',
                            lineHeight: 1.3,
                            paddingTop: '4px',
                            paddingBottom: '4px',
                          },
                        }}
                      />
                      {isAlreadySelected && (
                        <Typography
                          variant="caption"
                          display="block"
                          color="text.secondary"
                          sx={{ textAlign: 'center', mt: 0.5 }}
                        >
                          既に選択済み
                        </Typography>
                      )}
                    </Box>
                  );
                })}
              </Box>
            </DialogContent>
            <DialogActions>
              <Button onClick={handleCloseTagsModal} color="inherit">
                キャンセル
              </Button>
              <Button 
                onClick={handleAddSelectedTags} 
                color="primary" 
                variant="contained"
                disabled={selectedModalTags.length === 0}
              >
                選択したタグを追加 ({selectedModalTags.length})
              </Button>
            </DialogActions>
          </Dialog>
        </Card>

        {/* Manual Tag Addition Section */}
        <Card
          style={{margin: '10px', padding: '10px'}}
        >
          <Typography variant="h6" gutterBottom>
            タグを手動追加
          </Typography>
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
