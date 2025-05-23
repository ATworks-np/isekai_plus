'use client'

import React, { useState, useEffect } from 'react'
import { Box, Chip, IconButton, Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, InputAdornment, Typography } from '@mui/material'
import { styled } from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import CloseIcon from '@mui/icons-material/Close'
import { deleteDoc, doc } from 'firebase/firestore'
import { db } from '@/firebase'

import useTags from "@/hooks/useTags";

const MyChip = styled(Chip)(({ theme }) => ({
  borderRadius: '10px',
  padding: '5px 8px',
  fontWeight: '600',
}))

interface TagsSectionProps {
  tagsState: string[];
  setTagsState: React.Dispatch<React.SetStateAction<string[]>>;
}

const TagsSection: React.FC<TagsSectionProps> = props => {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [tagToDelete, setTagToDelete] = useState<{ key: string, name: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filteredTags, setFilteredTags] = useState<[string, any][]>([]);
  const [showAllTags, setShowAllTags] = useState<boolean>(false);

  const {tags, syncTags} = useTags();

  // Filter tags based on search query, selected tags, and showAllTags state
  useEffect(() => {
    if (!tags) return;

    const filtered = Object.entries(tags).filter(([key, tag]) => {
      // Always include selected tags
      if (props.tagsState?.includes(key)) {
        return true;
      }

      // If showAllTags is true, include all tags
      if (showAllTags) {
        return true;
      }

      // Only include non-selected tags if there's a search query
      if (!searchQuery) {
        return false;
      }

      // Check if tag.name and its properties exist before calling toLowerCase
      const jaMatch = tag.name?.ja && typeof tag.name.ja === 'string' 
        ? tag.name.ja.toLowerCase().includes(searchQuery.toLowerCase()) 
        : false;

      const enMatch = tag.name?.en && typeof tag.name.en === 'string'
        ? tag.name.en.toLowerCase().includes(searchQuery.toLowerCase())
        : false;

      return jaMatch || enMatch;
    });

    setFilteredTags(filtered);
  }, [tags, searchQuery, props.tagsState, showAllTags]);

  const handleDeleteClick = (event: React.MouseEvent, key: string, name: string) => {
    event.stopPropagation(); // Prevent the chip click event from firing
    setTagToDelete({ key, name });
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!tagToDelete) return;

    try {
      // Extract the document ID from the path (e.g., "versions/1/tags/abc123" -> "abc123")
      const pathParts = tagToDelete.key.split('/');
      const docId = pathParts[pathParts.length - 1];

      // Delete the tag from Firestore
      await deleteDoc(doc(db, 'versions/1/tags', docId));

      // Remove the tag from tagsState if it's selected
      if (props.tagsState?.includes(tagToDelete.key)) {
        props.setTagsState(prevTags => prevTags.filter(tag => tag !== tagToDelete.key));
      }

      // Sync tags to update the UI
      syncTags();

      // Close the dialog
      setDeleteDialogOpen(false);
      setTagToDelete(null);
    } catch (error) {
      console.error('Error deleting tag:', error);
      // Handle error (could add a snackbar or other notification here)
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
    setTagToDelete(null);
  };

  return (
      <>
        <div className="section">
          {/* Search Field and Show All Button */}
          <Box sx={{ mb: 2, display: 'flex', gap: 1 }}>
            <TextField
              sx={{ flex: 1 }}
              variant="outlined"
              placeholder="タグを検索..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                ),
                endAdornment: searchQuery ? (
                  <InputAdornment position="end">
                    <IconButton
                      aria-label="clear search"
                      onClick={() => setSearchQuery('')}
                      edge="end"
                    >
                      <CloseIcon />
                    </IconButton>
                  </InputAdornment>
                ) : null,
              }}
              size="small"
            />
            <Button
              variant={showAllTags ? "contained" : "outlined"}
              color="primary"
              onClick={() => setShowAllTags(!showAllTags)}
              size="small"
              sx={{ minWidth: '120px' }}
            >
              {showAllTags ? "通常表示" : "すべてを表示"}
            </Button>
          </Box>

          {/* Tag List */}
          <Box
            sx={{
              display: 'flex',
              flexWrap: 'wrap', // 折り返し
              gap: 1, // タグ間のスペース
            }}
          >
            {filteredTags.length === 0 && searchQuery ? (
              <Typography variant="body2" color="text.secondary" sx={{ p: 1 }}>
                検索結果がありません
              </Typography>
            ) : (
              filteredTags.map(([key, tag], index: number) => (
                <MyChip
                  key={index}
                  id={key}
                  label={tag.name['ja']}
                  color={props.tagsState?.includes(key) ? 'primary':'secondary'}
                  onClick={() => {
                    if (props.tagsState?.includes(key)) {
                      // key が含まれている場合は削除
                      props.setTagsState(prevTags => prevTags.filter(tag => tag !== key))
                    } else {
                      // key が含まれていない場合は追加
                      props.setTagsState(prevTags => [...prevTags, key])
                    }
                  }}
                  deleteIcon={<CloseIcon />}
                  onDelete={(event) => handleDeleteClick(event, key, tag.name['ja'])}
                />
              ))
            )}
          </Box>
        </div>

        {/* Confirmation Dialog */}
        <Dialog
          open={deleteDialogOpen}
          onClose={handleDeleteCancel}
          aria-labelledby="alert-dialog-title"
          aria-describedby="alert-dialog-description"
        >
          <DialogTitle id="alert-dialog-title">
            タグを削除しますか？
          </DialogTitle>
          <DialogContent>
            {tagToDelete && (
              <p>タグ「{tagToDelete.name}」をデータベースから削除します。この操作は元に戻せません。</p>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={handleDeleteCancel} color="primary">
              キャンセル
            </Button>
            <Button onClick={handleDeleteConfirm} color="error" autoFocus>
              削除
            </Button>
          </DialogActions>
        </Dialog>
      </>
  )
}

export default TagsSection
