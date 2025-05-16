import logo from '../../logo.svg'
import React from 'react'
import Tag from '../Tag'
import styles from './tags-section.module.css'
import Grid from '@mui/material/Grid'
import { Box, Chip } from '@mui/material'
import { styled } from '@mui/material'
import { Avatar } from '@mui/material'
import { Typography } from '@mui/material'
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted'
import GridOnIcon from '@mui/icons-material/GridOn'
import BottomNavigation from '@mui/material/BottomNavigation'
import BottomNavigationAction from '@mui/material/BottomNavigationAction'

const MyBox = styled(Box)(({ theme }) => ({
  position: 'absolute',
  bottom: 0,
  width: '100%',
  backgroundColor: '#FFF',
  zIndex: 1000,
  display: 'flex',
  justifyContent: 'space-evenly',
  padding: 10,
}))

const MyBottomNavigationAction = styled(BottomNavigationAction)(({ theme }) => ({
  '&.Mui-selected': {
    color: theme.palette.secondary.main,
  },
}))

interface ContentsListProps {
  handleChange: (value: number) => void
}

const ContentsList: React.FC<ContentsListProps> = props => {
  const [value, setValue] = React.useState(1)
  const handleChange = (newValue: number) => {
    setValue(newValue)
    props.handleChange(newValue)
  }
  return (
    <Box>
      <BottomNavigation showLabels value={value} onChange={(event, newValue) => handleChange(newValue)}>
        a
        <MyBottomNavigationAction label="Listed" icon={<FormatListBulletedIcon />} />
        <MyBottomNavigationAction label="Matrix" icon={<GridOnIcon />} />
      </BottomNavigation>
    </Box>
  )
}

export default ContentsList
