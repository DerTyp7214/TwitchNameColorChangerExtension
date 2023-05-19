import { UserEventType } from './event'

chrome.runtime.onMessage.addListener(async (request) => {
  if (request.type === 'getUser') {
    document.addEventListener(
      UserEventType,
      async (event) => {
        const CustomEvent = event as CustomEvent
        if (CustomEvent.detail) {
          await chrome.runtime.sendMessage({
            type: 'user',
            user: CustomEvent.detail.user,
          })
        }
      },
      { once: true }
    )
    window.postMessage({ type: 'getUser' }, '*')
  }
  return true
})
