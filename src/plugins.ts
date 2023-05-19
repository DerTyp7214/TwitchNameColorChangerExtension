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
    log(channel, tags.username, message)
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

  async changeColor(userState: tmi.CommonUserstate) {
    const currentColor = Color(userState.color)

    await this.client.color(currentColor.rotate(30).hex())
  }
}

export default Plugins
