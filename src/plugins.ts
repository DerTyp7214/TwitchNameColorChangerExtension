import Color from 'color'
import tmi from 'tmi.js'
import { log } from './logger'
import { TwitchUser } from './types'

class Plugins {
  private client: tmi.Client
  private user: TwitchUser

  constructor(client: tmi.Client, user: TwitchUser) {
    this.client = client
    this.user = user
  }

  onMessage(
    channel: string,
    tags: tmi.ChatUserstate,
    message: string,
    self: boolean
  ) {
    this.liveChat(channel, tags, message, self)

    if (tags.username === this.user.currentUserLogin) {
      this.changeColor(tags)
    }
  }

  onSubscription(
    channel: string,
    username: string,
    method: tmi.SubMethods,
    message: string,
    userstate: tmi.SubUserstate
  ) {
    if (userstate.username === this.user.currentUserLogin) {
      this.changeColor(userstate)
    }

    log(channel, username, method, message, userstate)
  }

  private async changeColor(userState: tmi.CommonUserstate) {
    const currentColor = Color(userState.color)

    await this.client.color(currentColor.rotate(30).hex())
  }

  private async liveChat(
    channel: string,
    tags: tmi.ChatUserstate,
    message: string,
    self: boolean
  ) {
    if (self) return

    log(channel, tags.username, message)

    await chrome.runtime
      .sendMessage({
        type: 'liveChat',
        channel,
        tags,
        message,
      })
      .catch(() => {})
  }
}

export default Plugins
