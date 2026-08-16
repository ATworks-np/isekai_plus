import { Box, Stack, Typography } from '@mui/material'
import { Link } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'

const Fotter: React.FC = () => {
  const t = useTranslations('footer')
  const site = useTranslations('site')
  return (
    <Box
      sx={{
        height: '150px',
        backgroundColor: 'rgba(0, 182, 223)',
        mt: '30px',
        padding: '20px',
      }}
    >
      <Stack direction="column" justifyContent="center" alignItems="center">
        {/* The only link to the work pages that exists in the HTML, since the
            list on the top page is built in the browser. */}
        <Link href="/animes/" style={{ textDecoration: 'none' }}>
          <Typography variant="caption" color="secondary">
            {t('allWorks')}
          </Typography>
        </Link>
        <Typography variant="caption" color="secondary">
          {site('searchName')}
        </Typography>
        <Typography variant="caption" color="secondary">
          Presented by ATworks
        </Typography>
      </Stack>
    </Box>
  )
}

export default Fotter
