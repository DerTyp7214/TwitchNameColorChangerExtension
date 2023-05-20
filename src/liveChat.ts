import Color from 'color'
import type tmi from 'tmi.js'
import { getTimeString } from './logger'

interface CustomMessage {
  type: string
  channel: string
  tags: tmi.ChatUserstate
  message: string
}

function getRandomColor() {
  const colors = [
    'Blue',
    'BlueViolet',
    'CadetBlue',
    'Chocolate',
    'Coral',
    'DodgerBlue',
    'Firebrick',
    'GoldenRod',
    'Green',
    'HotPink',
    'OrangeRed',
    'Red',
    'SeaGreen',
    'SpringGreen',
    'YellowGreen',
  ]
  return colors[Math.floor(Math.random() * colors.length)].toLowerCase()
}

let chat = document.getElementById('chat')

function color(tags: tmi.ChatUserstate): Color {
  const tagsColor = tags.color

  return Color(tagsColor ?? getRandomColor())
}

const colorCache = new Map()
function calculateColor(color: string): string {
  const cacheKey = color
  if (colorCache.has(cacheKey)) return colorCache.get(cacheKey)

  const colorRegex = /^#[0-9a-f]+$/i
  if (!colorRegex.test(color)) return color

  const [h, s, l] = Color(color).hsl().array()

  color = Color.hsl(h, 75, 65).hexa()

  colorCache.set(cacheKey, color)
  if (colorCache.size > 1000) {
    colorCache.delete(colorCache.entries().next().value[0])
  }
  return color
}

chrome.runtime.onMessage.addListener(function (message: CustomMessage) {
  if (!chat) chat = document.getElementById('chat')

  if (message.type && message.type == 'liveChat' && chat) {
    const messageElement = document.createElement('div')
    const time = document.createElement('span')
    const channel = document.createElement('span')
    const name = document.createElement('span')
    const text = document.createElement('span')

    time.innerText = getTimeString(false) + ' '
    channel.innerText = message.channel + ' '
    name.innerText = message.tags['display-name'] + ': '
    text.innerText = message.message

    const nameColor = color(message.tags)
    const backgroundColor = nameColor.alpha(0.125)

    name.style.color = calculateColor(nameColor.hexa())
    messageElement.style.background = backgroundColor.hexa()

    time.classList.add('time')
    channel.classList.add('channel')
    name.classList.add('name')
    text.classList.add('text')

    messageElement.appendChild(channel)
    messageElement.appendChild(time)
    messageElement.appendChild(name)
    messageElement.appendChild(text)

    messageElement.classList.add('message')

    chat.appendChild(messageElement)

    if (chat.children.length > 100) {
      chat.removeChild(chat.children[0])
    }

    messageElement.scrollIntoView({ behavior: 'smooth' })
  }
})
