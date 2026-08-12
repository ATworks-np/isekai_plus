interface IComment {
  avatarUrl: string;
  name: string;
  comment: string;
  date: string;
  uid?: string;
  docId?: string;
  // Which season the comment was written against. Absent on comments predating
  // the seasons model, which is why nothing may assume it is set.
  seasonId?: string;
}

interface ICommentClass {
  props: IComment
}

class Comment implements ICommentClass {
  props: IComment

  constructor(props: IComment) {
    this.props = props
  }

}

export default Comment
