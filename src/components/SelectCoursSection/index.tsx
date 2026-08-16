import React from "react";
import { Chip, Grid, Box, MenuItem, Select, styled } from "@mui/material";
import { courAtom } from '@/stores/coursState'
import { useAtom } from 'jotai'
import { useLocale, useTranslations } from 'next-intl'
import { courLabel } from '@/utils/cour'
import { SORT_OPTIONS } from '@/models/animeList'
import type { SortKey } from '@/models/animeList'

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

type SelectCoursSectionProps = {
  sort: SortKey
  onSortChange: (sort: SortKey) => void
}

const SelectCoursSection: React.FC<SelectCoursSectionProps> = ({ sort, onSortChange }) => {
  const t = useTranslations('list')
  const locale = useLocale()
  const [coursState, setCoursState] = useAtom<string[]>(courAtom);

  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const currentQuarterIndex = Math.floor((currentMonth - 1) / 3);

  const buttons = Array.from({ length: 12 }, (_, i) => {
    const quarterIndex = (currentQuarterIndex - i + 4 * 10) % 4;
    const yearAdjustment = Math.floor((currentQuarterIndex - i) / 4);
    const quarterYear = currentYear + yearAdjustment;
    const key = `${quarterYear}-Q${quarterIndex + 1}`;
    // The chip names the quarter in the reader's language: 2026春 / Spring 2026.
    const label = i === 0 ? t('currentCour') : courLabel(key, locale) ?? key;
    return { label, key };
  });

  // One cour at a time. The list is filtered by cour on the server, which takes
  // a single quarter, so a second chip only ever narrowed the page that had
  // already loaded — the same choice behaved differently depending on how far
  // the reader had scrolled. Selecting again clears it.
  const onClick = (cours: string) => {
    setCoursState((prev) => (prev.includes(cours) ? [] : [cours]));
  };

  return (
    <Box sx={{ display: 'flex', width: '100%', flexDirection: 'column', gap: 1 }}>
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
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', px: 0.5 }}>
        <Select
          size="small"
          value={sort}
          onChange={event => onSortChange(event.target.value as SortKey)}
          inputProps={{ 'aria-label': t('sortLabel') }}
          sx={{
            width: 92,
            backgroundColor: '#FFF',
            borderRadius: '10px',
            fontSize: '0.875rem',
            fontWeight: 600,
            '& .MuiSelect-select': { py: 1, pl: 1.25, pr: '28px !important' },
          }}
        >
          {SORT_OPTIONS.map(option => (
            <MenuItem key={option} value={option}>
              {t(`sort${option[0].toUpperCase()}${option.slice(1)}`)}
            </MenuItem>
          ))}
        </Select>
      </Box>
    </Box>
  );
};

export default SelectCoursSection;
