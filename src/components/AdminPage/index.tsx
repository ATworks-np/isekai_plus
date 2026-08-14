import * as React from 'react';
import { Container } from '@mui/material';
import ApiKeys from "@/components/AdminPage/ApiKeys";
import CacheControl from "@/components/AdminPage/CacheControl";

// Registering works now goes through the write API and the season-anime skill,
// which sets the source ids and the season a record needs. The form set neither,
// so anything added through it arrived unlinked and unratable.
const AdminPage: React.FC = props => {
  return (
    <Container maxWidth="md" sx={{ mt: 4, mb: 6 }}>
      <ApiKeys />
      <CacheControl />
    </Container>
  )
}

export default AdminPage
