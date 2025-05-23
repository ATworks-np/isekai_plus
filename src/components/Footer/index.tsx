import { Box, Stack, Typography } from "@mui/material";

const Fotter: React.FC = () => {
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
        <Typography variant="caption" color="secondary">
          Isekai Plus
        </Typography>
        <Typography variant="caption" color="secondary">
          Presented by ATworks
        </Typography>
      </Stack>
    </Box>
  );
};

export default Fotter;
