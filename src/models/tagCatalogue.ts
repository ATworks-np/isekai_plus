export type TagCatalogueEntry = {
  id: string
  name: { ja?: string; en?: string } | null
  group: string | null
}

export type TagCatalogue = Record<string, TagCatalogueEntry>
