import { createTheme } from '@mui/material/styles'

const theme = createTheme({
  palette: {
    primary: {
      main: '#00B6DF',
      contrastText: '#fff',
    },
    secondary: {
      main: '#fff',
      contrastText: '#193238',
    },
    background: {
      default: '#F6F8F9',
    },
    text: { primary: '#193238', secondary: '#DDD' },
  },
  typography: {
    fontFamily: "'Noto Sans JP', sans-serif",
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        // グローバルに適用するスタイルを記述
        a: {
          textDecoration: "none", // 下線を削除
          color: "inherit", // 親の色を継承
        },
      },
    },
  },
})

export default theme
