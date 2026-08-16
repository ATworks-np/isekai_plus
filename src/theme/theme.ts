import { createTheme } from '@mui/material/styles'

const theme = createTheme({
  palette: {
    primary: {
      main: '#00B6DF',
      // Small tag text needs at least 4.5:1 against the page background.
      dark: '#007A96',
      contrastText: '#fff',
    },
    secondary: {
      main: '#fff',
      contrastText: '#193238',　
    },
    background: {
      default: '#F6F8F9',
    },
    // secondary was #DDD, which is a colour for text on the blurred key visual,
    // not for text on the page: on the #F6F8F9 background it contrasts about
    // 1.1 to 1 and cannot be read at all. Everything that actually sits on
    // artwork asks for white explicitly. This is #193238 lightened to the point
    // where it still passes AA on the page background.
    text: { primary: '#193238', secondary: '#5B7178' },
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
