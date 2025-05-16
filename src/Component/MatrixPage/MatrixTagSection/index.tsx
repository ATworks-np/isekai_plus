import React from 'react'
import { Box, Chip } from '@mui/material'
import { styled } from '@mui/material'
import { useTranslation } from 'react-i18next'
import Tag from '../../Tag'
const MyChip = styled(Chip)(({ theme }) => ({
  borderRadius: '10px',
  padding: '5px 8px',
  fontWeight: '600',
  transform: 'rotate(60deg)',
}))

const MyBox = styled(Box)(({ theme }) => ({
  paddingTop: '150px',
  paddingBottom: '100px',
  paddingLeft: '150px',
  // whiteSpace: 'nowrap',   // Prevent text from wrapping
  // overflow: 'visible',    // Allow overflow to be visible
  // textOverflow: 'ellipsis', // Optional: Adds "..." when text is too long
  // maxWidth: 'none',
}))
const MatrixTagSection: React.FC = props => {
  const { t, i18n } = useTranslation()
  const tagName = [t('tag-1'), '前世の記憶', '生まれて転生', '事故死', '学生', '一人で転生', '魔法有り', 'ハーレム']
  return (
    <MyBox style={{ display: 'flex', alignItems: 'flex-end' }}>
      {/*{tagName.map((tag, index) => (*/}
      {/*    <Box sx={{minWidth: '50px', width: '10%', maxWidth: '70px', whiteSpace: 'nowrap',}}>*/}
      {/*      <Tag*/}
      {/*        label={tag}*/}
      {/*      />*/}
      {/*    </Box>*/}

      {/*))}*/}
    </MyBox>
  )
}

export default MatrixTagSection
