import logo from '../../logo.svg'
import React, { useEffect, useState } from 'react'
import styles from './tag.module.css'
import { Chip, Typography } from '@mui/material'
import { styled } from '@mui/material'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '@/firebase'

interface TagProps {
  active?: boolean
  id: number
  onClick: (id: number) => void
  label: string
}

const MyDiv = styled('div')(({ theme }) => ({
  borderRadius: '10px',
  padding: '5px 8px',
  fontWeight: '600',
  backgroundColor: '#FFF',
  whiteSpace: 'nowrap',
  width: '150px',
  position: 'relative',
  left: '-150px',
  transform: 'rotate(60deg)',
  transformOrigin: 'bottom right',
  textAlign: 'right',
}))

const Tag: React.FC<TagProps> = props => {
  return (
    <MyDiv
      onClick={() => {
        props.onClick(props.id)
      }}
    >
      {props.label}
    </MyDiv>
  )
}

export default Tag
