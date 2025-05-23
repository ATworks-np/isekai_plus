import React from 'react'
import { useAtom } from 'jotai'
import { searchModalAtom } from '@/store/serchModalState'
import { Box, Modal } from '@mui/material'
import TagsSection from '@/components/TagsSection'
import theme from '@/theme/theme'
import { searchSelectedTagAtom } from "@/store/searchSelectedTagAtom";
const style = {
  position: 'absolute',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  width: '100%',
  bgcolor: theme.palette.background.default,
  p: 2,
  maxWidth: '800px',
}

const SearchModal: React.FC = props => {
  const [open, setOpen] = useAtom<boolean>(searchModalAtom)
  const [tagsState, setTagsState] = useAtom<string[]>(searchSelectedTagAtom)

  return (
    <Modal open={open} onClose={() => setOpen(false)}>
      <Box sx={style}>
        <TagsSection tagsState={tagsState} setTagsState={setTagsState} />
      </Box>
    </Modal>
  )
}

export default SearchModal
