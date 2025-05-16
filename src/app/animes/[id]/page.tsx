import AnimePage from "@/Component/AnimePage"
import { api } from "@/Routes/routs"
import {IAnimeStatic} from "@/models/interfaces/animeStatic";

type Props = {
  params: Promise<{ id: string }>
}

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

export default async function Page({ params }: Props) {
  const { id } = await params

  const res = await fetch(api.animes+'/'+id+'/statics')

  if (!res.ok) {
    throw new Error('Failed to fetch anime ids')
  }

  const data: IAnimeStatic = await res.json()
  return <AnimePage {...data} />
}
