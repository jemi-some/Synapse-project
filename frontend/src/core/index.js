////// Component //////
export class Component {
  constructor(payload = {}) {
    const {
      tagName = 'div',
      state = {},
      props = {}
    } = payload
    this.el = document.createElement(tagName)
    this.state = state
    this.props = props
    this.render()
  }
  render() {
  }
}

////// Store //////
export class Store {
  constructor(state) {
    this.state = {}
    this.observers = {}
    for (const key in state) {
      Object.defineProperty(this.state, key, {
        get: () => state[key],
        set: (val) => {
          if (state[key] !== val) {
            state[key] = val
            if (Array.isArray(this.observers[key])) {
              this.observers[key].forEach(observer => observer(val))
            }
          }
        }
      })
    }
  }
  subscribe(key, cb) {
    Array.isArray(this.observers[key])
      ? this.observers[key].push(cb)
      : this.observers[key] = [cb]
  }

  unsubscribe(key, cb) {
    if (Array.isArray(this.observers[key])) {
      const index = this.observers[key].indexOf(cb)
      if (index > -1) {
        this.observers[key].splice(index, 1)
      }
    }
  }
}
