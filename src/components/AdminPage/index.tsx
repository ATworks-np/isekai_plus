'use client'

import * as React from 'react'
import { Container, Tab, Tabs } from '@mui/material'
import ApiKeys from '@/components/AdminPage/ApiKeys'
import CacheControl from '@/components/AdminPage/CacheControl'
import Tags from '@/components/AdminPage/Tags'
import TagReview from '@/components/AdminPage/TagReview'

// Registering works now goes through the write API and the season-anime skill,
// which sets the source ids and the season a record needs. The form set neither,
// so anything added through it arrived unlinked and unratable.
const PANELS = [
  { key: 'review', label: 'タグ承認', render: () => <TagReview /> },
  { key: 'tags', label: 'タグ', render: () => <Tags /> },
  {
    key: 'system',
    label: 'システム',
    render: () => (
      <>
        <ApiKeys />
        <CacheControl />
      </>
    ),
  },
]

const AdminPage: React.FC = () => {
  const [panel, setPanel] = React.useState<string>(PANELS[0].key)

  return (
    <Container maxWidth="md" sx={{ mt: 4, mb: 6 }}>
      <Tabs
        value={panel}
        onChange={(_, value) => setPanel(value)}
        sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}
      >
        {PANELS.map(entry => (
          <Tab key={entry.key} value={entry.key} label={entry.label} />
        ))}
      </Tabs>
      {PANELS.find(entry => entry.key === panel)?.render()}
    </Container>
  )
}

export default AdminPage
