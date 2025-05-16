interface IUserConstructor {
  uid: string | undefined
  token: string
  displayName: string | null
  type: 'guest' | 'standard' | 'admin' | undefined
  photoURL: string | null;
}

interface IUser {
  uid: string | undefined
  token: string
  displayName: string | null
  type: 'guest' | 'standard' | 'admin' | undefined
  photoURL: string | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
}

interface IUserClass {
  props: IUser
}

class User implements IUserClass {
  props: IUser;

  constructor(props: IUserConstructor) {
    this.props = { ...props, isAuthenticated: false, isAdmin: false}
    this.props.isAuthenticated = this.isAuthenticated()
    this.props.isAdmin = this.isAdmin()
  }

  setGuest() {
    this.props = {
      uid: undefined,
      token: 'guest',
      displayName: null,
      photoURL: null,
      type: 'guest',
      isAuthenticated: false,
      isAdmin: false
    }
  }

  isAuthenticated() {
    return !!this.props.uid;
  }

  isAdmin() {
    if(this.props.token && this.props.type=='admin') return true
    return false
  }

  set(updates: Partial<IUser>) {
    this.props = { ...this.props, ...updates };
  }
}

export default User

const guestUser = new User({
    uid: undefined,
    token: 'guest',
    displayName: null,
    photoURL: null,
    type: 'guest',
});

export { guestUser };
