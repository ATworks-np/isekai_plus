import * as React from 'react';
import { Container } from '@mui/material';
import AddTitle from "@/components/AdminPage/AddTitle";
import ApiKeys from "@/components/AdminPage/ApiKeys";
import CacheControl from "@/components/AdminPage/CacheControl";

const AdminPage: React.FC = props => {
  return (
    <>
      <AddTitle id={undefined}/>
      <Container maxWidth="md" sx={{ mb: 6 }}>
        <ApiKeys />
        <CacheControl />
      </Container>
    </>
  )
}

export default AdminPage
