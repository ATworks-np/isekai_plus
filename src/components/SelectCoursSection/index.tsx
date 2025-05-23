import React from "react";
import { Chip, Grid, Box, styled } from "@mui/material";
import { courAtom } from '@/store/coursState'
import { useAtom } from 'jotai'

const MyChip = styled(Chip)(({ theme }) => ({
  borderRadius: '10px',
  padding: '5px 8px',
  fontWeight: '600',
}));

const MyGrid = styled(Grid)(({ theme }) => ({
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  height: "100%",
}));

const SelectCoursSection: React.FC = () => {
  const [coursState, setCoursState] = useAtom<string[]>(courAtom);

  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const quarters = ["冬", "春", "夏", "秋"];
  const currentQuarterIndex = Math.floor((currentMonth - 1) / 3);

  const buttons = Array.from({ length: 12 }, (_, i) => {
    const quarterIndex = (currentQuarterIndex - i + 4 * 10) % 4;
    const yearAdjustment = Math.floor((currentQuarterIndex - i) / 4);
    const quarterYear = currentYear + yearAdjustment;
    const label = i === 0 ? "今期" : `${quarterYear}${quarters[quarterIndex]}`;
    const key = `${quarterYear}-Q${quarterIndex + 1}`;
    return { label, key, year: quarterYear, quarter: quarters[quarterIndex] };
  });

  const onClick = (cours: string) => {
    setCoursState((prev) => {
      if (prev.includes(cours)) return prev.filter((item) => item !== cours);
      return [...prev, cours];
    });
  };

  return (
    <div style={{ display: "flex", height: "100%", justifyContent: "center", alignItems: "center" }}>
      <Box
        sx={{
          width: '100%',
          overflowX: 'auto',
          scrollbarWidth: 'none',        // Firefox
          '&::-webkit-scrollbar': {
            display: 'none',             // Chrome, Safari
          },
        }}
      >
        <Grid container spacing={0} sx={{ width: 'max-content' }}>
          {buttons.map((btn) => (
            <MyGrid key={btn.key}>
              <MyChip
                label={btn.label}
                color={coursState.includes(btn.key) ? 'primary' : 'secondary'}
                onClick={() => onClick(btn.key)}
                sx={{ margin: '0 4px' }}
              />
            </MyGrid>
          ))}
        </Grid>
      </Box>
    </div>
  );
};

export default SelectCoursSection;
