interface IComment {
  avatarUrl: string;
  name: string;
  comment: string;
  date: string;
  uid?: string;
  docId?: string;
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
