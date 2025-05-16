import {DocumentReference} from "firebase/firestore";
import {IRatings} from "@/models/interfaces/ratings";

interface IAnime {
  id: string
  name: {
    ja: string
    en: string
  }
  tagIds: string[]
  cours: string[]
  ratings:IRatings;
}

interface IAnimeClass {
  props: IAnime
}

class Anime implements IAnimeClass {
  props: IAnime

  constructor(props: IAnime) {
    this.props = props
  }

  static createDefault(): Anime {
    return new Anime({
      id: '',
      name: { ja: '', en: '' },
      tagIds: [],
      cours: [],
      ratings: {
        story: 0,
        character: 0,
        animation: 0,
        message: 0,
        worldview: 0,
      },
    });
  }
}

export default Anime