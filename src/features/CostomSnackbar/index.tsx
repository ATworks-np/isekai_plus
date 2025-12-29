'use client'

import React from 'react'
import { useAtom } from 'jotai'
import { Snackbar} from '@mui/material'
import {customSnackbarAtom} from "@/stores/customSnackbarState";
import IconButton from "@mui/material/IconButton";
import CloseIcon from "@mui/icons-material/Close";

const CustomSnackbar: React.FC = props => {
  const [message, setMessage] = useAtom<string>(customSnackbarAtom)

  const handleClose = () => {
    setMessage('')
  }

  const action = (
    <React.Fragment>
      <IconButton
        size="small"
        aria-label="close"
        onClick={handleClose}
      >
        <CloseIcon fontSize="small" sx={{ color: 'white' }} />
      </IconButton>
    </React.Fragment>
  );

  return (
    <Snackbar
      open={message !== ''}
      autoHideDuration={5000}
      anchorOrigin={{ vertical:'bottom', horizontal:'center' }}
      onClose={handleClose}
      message={message}
      action={action}
    />
  )
}

export default CustomSnackbar
