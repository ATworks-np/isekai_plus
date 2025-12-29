'use client'

import {AppBar, Avatar, Box, Divider, Toolbar, Typography, useScrollTrigger} from '@mui/material'
import React, {useEffect, useState} from 'react'
import SearchIcon from '@mui/icons-material/Search'
import IconButton from '@mui/material/IconButton'
import AccountCircleIcon from '@mui/icons-material/AccountCircle'
import { useAtom } from 'jotai'
import { searchModalAtom } from '@/stores/serchModalState'
import { loginModalAtom } from '@/stores/loginModalState'
import { userAtom } from '@/stores/userStore'
import Stack from '@mui/material/Stack'
import useUser from '@/hooks/useUser'
import {alpha, styled} from "@mui/material/styles";
import Menu, {MenuProps} from "@mui/material/Menu";
import MenuItem from '@mui/material/MenuItem';
import EditIcon from '@mui/icons-material/Edit';
import {api} from "@/Routes/routs";
import Link from "next/link";
import User from "@/models/entities/user";
import { useRouter } from 'next/navigation'

const StyledMenu = styled((props: MenuProps) => (
  <Menu
    elevation={0}
    anchorOrigin={{
      vertical: 'bottom',
      horizontal: 'right',
    }}
    transformOrigin={{
      vertical: 'top',
      horizontal: 'right',
    }}
    {...props}
  />
))(({ theme }) => ({
  '& .MuiPaper-root': {
    borderRadius: 6,
    marginTop: theme.spacing(1),
    minWidth: 180,
    color: 'rgb(55, 65, 81)',
    boxShadow:
      'rgb(255, 255, 255) 0px 0px 0px 0px, rgba(0, 0, 0, 0.05) 0px 0px 0px 1px, rgba(0, 0, 0, 0.1) 0px 10px 15px -3px, rgba(0, 0, 0, 0.05) 0px 4px 6px -2px',
    '& .MuiMenu-list': {
      padding: '4px 0',
    },
    '& .MuiMenuItem-root': {
      '& .MuiSvgIcon-root': {
        fontSize: 18,
        color: theme.palette.text.secondary,
        marginRight: theme.spacing(1.5),
      },
      '&:active': {
        backgroundColor: alpha(
          theme.palette.primary.main,
          theme.palette.action.selectedOpacity,
        ),
      },
    },
    ...theme.applyStyles('dark', {
      color: theme.palette.grey[300],
    }),
  },
}));

const UpperAppBar: React.FC = props => {
  const [openSerchModal, setOpenSerchModal] = useAtom<boolean>(searchModalAtom)
  const [loginOpen, setLoginOpen] = useAtom<boolean>(loginModalAtom)
  const { user, setUser } = useUser()
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);
  const router = useRouter()


  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };
  const handleClose = () => {
    setAnchorEl(null);
  };

  return (
    <ElevationScroll>
      <AppBar elevation={0}>
        <Toolbar>
          <Link href="/" style={{ textDecoration: 'none' }}>
            <Typography component="div">いせかいぷらす</Typography>
          </Link>
          <Box sx={{ flexGrow: 1 }}>
            <IconButton aria-label="search" onClick={() => setOpenSerchModal(true)}>
              <SearchIcon />
            </IconButton>
          </Box>

          {user.props?.token !=='' && <Stack direction="row" alignItems="center">
            <Typography>{user.props?.displayName}</Typography>
            <IconButton aria-label="account" onClick={(event) => {
              if (!user.props?.isAuthenticated) {
                router.push('/login')
              } else {
                handleClick(event)
              }
            }}>
              {user.props?.isAuthenticated ? <Avatar alt={user.props?.displayName ?? ''} src={user.props.photoURL??''} sx={{ width: 28, height: 28 }} /> : <AccountCircleIcon />}
            </IconButton>
          </Stack>}
        </Toolbar>
        <StyledMenu
          id="demo-customized-menu"
          MenuListProps={{
            'aria-labelledby': 'demo-customized-button',
          }}
          anchorEl={anchorEl}
          open={open}
          onClose={handleClose}
        >
          <Link href={'/user'}>
            <MenuItem onClick={handleClose} disableRipple>
              Account
            </MenuItem>
          </Link>
          <Link href={'/logout'}>
            <MenuItem onClick={handleClose} disableRipple>
              Logout
            </MenuItem>
          </Link>
          {user.props?.isAdmin &&
            <Link href={'/admin'}>
              <MenuItem onClick={handleClose} disableRipple>
                Admin
              </MenuItem>
            </Link>
          }
          {user.props?.isAdmin &&
            <Link href={api.animes +'?clear=38FEF305540D4A528BB053A5C1293C83'}>
              <MenuItem onClick={handleClose} disableRipple>
                Clear Cache
              </MenuItem>
            </Link>
          }
        </StyledMenu>
      </AppBar>
    </ElevationScroll>
  )
}

export default UpperAppBar

function ElevationScroll(props: any) {
  const { children } = props
  const [opacity, setOpacity] = useState<number | null>(null)

  useEffect(() => {
    const handleScroll = () => {
      const maxScroll = 150;
      const scrollY = window.scrollY;
      const newOpacity = Math.max(0, Math.min(1, 1 - scrollY / maxScroll));
      setOpacity(newOpacity);
    }

    handleScroll()
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  if (opacity === null) return children // SSR側では style をつけない
  const interpolateColor = (start: number, end: number, factor: number) =>
    Math.round(start + (end - start) * factor);
  const style = {
    backgroundColor: `rgba(0, 182, 223, ${1 - opacity})`,
    color: `rgb(
    ${interpolateColor(25, 255, 1 - opacity)},
    ${interpolateColor(50, 255, 1 - opacity)},
    ${interpolateColor(56, 255, 1 - opacity)}
  )`,
    transition: 'opacity 0.5s ease-out',
  }

  return React.cloneElement(children, { style })


}
