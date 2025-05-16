import AddTitle from "@/Component/AdminPage/AddTitle";
import {api} from "@/Routes/routs";

export async function generateStaticParams() {
  const res = await fetch(api.animes+'/ids')

  if (!res.ok) {
    throw new Error('Failed to fetch anime ids')
  }

  const data = await res.json()

  // 期待するレスポンス形式: { ids: ['id1', 'id2', 'id3'] }
  return data.ids.map((id: string) => ({
    id,
  }))
}


type Props = {
  params: Promise<{ id: string }>
}


export default async function Page({ params }: Props) {
  const { id } = await params

  return <AddTitle id={id} />;
}
