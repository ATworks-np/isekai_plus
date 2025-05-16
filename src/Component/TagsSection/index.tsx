'use client'

import React from 'react'
import { Box, Chip } from '@mui/material'
import { styled } from '@mui/material'


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


  const {tags, syncTags} = useTags()

  return (

      <div className="section">
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap', // 折り返し
            gap: 1, // タグ間のスペース
          }}
        >
          {Object.entries(tags).map(([key, tag], index: number) => (
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
            />
          ))}
        </Box>
      </div>

  )
}

export default TagsSection
