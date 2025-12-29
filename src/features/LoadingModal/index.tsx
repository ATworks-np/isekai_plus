'use client'

import React from 'react'
import { useAtom } from 'jotai'
import { Box, Modal } from '@mui/material'
import CircularProgress from "@mui/material/CircularProgress";
import { loadingModalAtom } from '@/stores/loadingModalState'

const LoadingModal: React.FC = props => {
  const [open, setOpen] = useAtom(loadingModalAtom)
  return (
    <Modal
      open={open}
      aria-labelledby="loading-modal"
      aria-describedby="loading-modal-description"
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          bgcolor: 'rgba(0, 0, 0, 0.5)',
        }}
      >
        <CircularProgress />
      </Box>
    </Modal>
  )
}

export default LoadingModal
