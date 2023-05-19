import { UserEvent } from './event'
import { error } from './logger'
import { TwitchUser } from './types'

interface ReactNode extends Node {
  stateNode: any
  return: ReactNode
}

class TNCCE {
  static getChatInstance() {
    let chat
    try {
      const node = this.searchReactParents(
        this.getReactInstance(
          document.querySelector(
            'section[data-test-selector="chat-room-component-layout"]'
          )
        ),
        (n) =>
          n.stateNode && n.stateNode.props && n.stateNode.props.onSendMessage
      )
      chat = node?.stateNode
    } catch (e) {
      error(e)
    }

    return chat
  }

  static searchReactParents(
    node: ReactNode | null,
    criteria: (node: ReactNode) => any,
    depth = 0,
    maxDepth = 15
  ): ReactNode | null {
    if (!node) return null
    try {
      if (criteria(node)) {
        return node
      }
    } catch (e) {}

    if (!node || depth > maxDepth) {
      return null
    }

    const { return: parent } = node
    if (parent) {
      return this.searchReactParents(parent, criteria, depth++, maxDepth)
    }
    return null
  }

  static getReactInstance(element: Node | null): ReactNode | null {
    if (!element) return null
    for (const key in element) {
      if (key.startsWith('__reactInternalInstance'))
        return (element as any)[key as any]
    }
    return null
  }

  static getUser(): TwitchUser | null {
    const chat = this.getChatInstance()

    if (chat) {
      const user = chat.props
      return {
        authToken: user.authToken,
        currentUserDisplayName: user.currentUserDisplayName,
        currentUserLogin: user.currentUserLogin,
        userID: user.userID,
      }
    }

    return null
  }
}

window.addEventListener('message', (event) => {
  if (event.data?.type === 'getUser') {
    document.dispatchEvent(UserEvent({ user: TNCCE.getUser() }))
  }
})

declare global {
  interface Window {
    TNCCE: typeof TNCCE
  }
}

window.TNCCE = TNCCE
