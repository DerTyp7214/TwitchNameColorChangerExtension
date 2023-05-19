
interface EventData {
  [key: string]: any
}

const UserEventType = 'tncce-user-event'

function UserEvent(data: EventData) {
  return new CustomEvent(UserEventType, { detail: data })
}

export { UserEvent, UserEventType }

