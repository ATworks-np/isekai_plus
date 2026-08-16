'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { Box, Chip, IconButton, Button, TextField, InputAdornment, Typography } from '@mui/material'
import { styled } from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import CloseIcon from '@mui/icons-material/Close'
import { useLocale, useTranslations } from 'next-intl'

import useTags from "@/hooks/useTags";
import { ITag } from '@/models/entities/tag'

const MyChip = styled(Chip)(({ theme }) => ({
  borderRadius: '10px',
  padding: '5px 8px',
  fontWeight: '600',
}))

/**
 * A picker, and only a picker. It used to carry a delete button on every chip
 * that called deleteDoc straight from the reader's browser: a signed-out
 * visitor saw an offer to delete a tag from the database, the rules refused it,
 * and nothing was said. An admin pressing the same button did delete it —
 * without the reference cleanup the admin screen does — which is how eleven
 * works came to point at a tag that no longer exists. Deleting a tag belongs to
 * the tag admin screen, where the works that use it are unpicked first.
 */
interface TagsSectionProps {
  tagsState: string[];
  // Takes the next list rather than a state setter, so a caller is free to
  // derive the current one instead of storing it.
  setTagsState: (tags: string[]) => void;
}

const TagsSection: React.FC<TagsSectionProps> = props => {
  const locale = useLocale();
  const t = useTranslations('tags');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showAllTags, setShowAllTags] = useState<boolean>(false);

  const {tags} = useTags();

  // A tag carries an English name only once someone has written one, so the
  // Japanese one is the fallback — the same rule the work titles follow.
  const nameOf = (tag: ITag) => (locale === 'ja' ? tag.name.ja : tag.name.en?.trim() || tag.name.ja);

  // Derived, not stored: this is a pure function of tags, the query and the
  // toggles, so keeping it in state meant rendering once with the old list.
  const filteredTags = useMemo(() => {
    if (!tags) return [];

    return Object.entries(tags).filter(([key, tag]) => {
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
  }, [tags, searchQuery, props.tagsState, showAllTags]);

  return (
      <>
        <div className="section">
          {/* Search Field and Show All Button */}
          <Box sx={{ mb: 2, display: 'flex', gap: 1 }}>
            <TextField
              sx={{ flex: 1 }}
              variant="outlined"
              placeholder={t('search')}
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
              {showAllTags ? t('showSelected') : t('showAll')}
            </Button>
          </Box>

          {/* Tag List */}
          <Box
            sx={{
              display: 'flex',
              flexWrap: 'wrap', // 折り返し
              gap: 1, // タグ間のスペース
              // すべて表示時はスクロール可能にする
              maxHeight: showAllTags ? 320 : 'none',
              overflowY: showAllTags ? 'auto' : 'visible',
              pr: showAllTags ? 1 : 0, // スクロールバー分の余白
            }}
          >
            {filteredTags.length === 0 && searchQuery ? (
              <Typography variant="body2" color="text.secondary" sx={{ p: 1 }}>
                {t('noResults')}
              </Typography>
            ) : (
              filteredTags.map(([key, tag], index: number) => (
                <MyChip
                  key={index}
                  id={key}
                  label={nameOf(tag)}
                  color={props.tagsState?.includes(key) ? 'primary':'secondary'}
                  onClick={() => {
                    if (props.tagsState?.includes(key)) {
                      // key が含まれている場合は削除
                      props.setTagsState(props.tagsState.filter(tag => tag !== key))
                    } else {
                      // key が含まれていない場合は追加
                      props.setTagsState([...props.tagsState, key])
                    }
                  }}
                />
              ))
            )}
          </Box>
        </div>
      </>
  )
}

export default TagsSection
