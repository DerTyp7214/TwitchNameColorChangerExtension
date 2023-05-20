import tmi from 'tmi.js'
import { log } from './logger'
import Plugins from './plugins'
import { TwitchUser } from './types'

let readClient: tmi.Client
let writeClient: tmi.Client
let plugins: Plugins

async function createTmiClient(user: TwitchUser) {
  log(`Creating TMI WriteClient for ${user.currentUserLogin}`)

  writeClient = new tmi.Client({
    connection: {
      secure: true,
      reconnect: true,
    },
    identity: {
      username: user.currentUserLogin,
      password: user.authToken,
    },
    channels: [],
  })

  log('Creating TMI ReadClient')

  readClient = new tmi.Client({
    connection: {
      secure: true,
      reconnect: true,
    },
    channels: [],
  })

  plugins = new Plugins(writeClient, user)

  readClient.once('connecting', () => {
    log('Connecting ReadClient')
  })
  readClient.once('connected', async () => {
    log('Joining channels')
    for (let i = 0; i < chatsToJoin.length; i++) {
      const channel = chatsToJoin.pop()
      if (channel && readClient.getChannels().includes(`#${channel}`)) continue
      log('Joining channel', channel)
      if (channel) await readClient.join(channel)
      await new Promise((res) => setTimeout(res, 50))
    }

    log('Adding listeners')
    addListeners()

    log('ReadClient connected')
  })

  log('Connecting TMI Clients')
  await readClient.connect()
  await writeClient.connect()
}

function addListeners() {
  if (!readClient) return

  readClient.on('message', plugins.onMessage.bind(plugins))
  readClient.on('subscription', plugins.onSubscription.bind(plugins))
}

const tabs: {
  [key: number]: chrome.tabs.Tab
} = {}

const chatsToJoin: string[] = []

async function addTab(tab: chrome.tabs.Tab) {
  if (tab.url?.includes('twitch.tv') && tab.id && !tabs[tab.id] && tab.url) {
    await getUser(tab.id)
    await update(tab, true)
  }
}

async function removeTab(tabId: chrome.tabs.Tab | number) {
  let tab: chrome.tabs.Tab | undefined =
    typeof tabId === 'number' ? tabs[tabId] : tabId

  if (!tab && typeof tabId === 'number')
    tab = await new Promise<chrome.tabs.Tab>((res) =>
      chrome.tabs.get(tabId, res)
    ).catch(async () => {
      await reconnect()
      return undefined
    })

  if (tab) {
    await update(tab, false)
  }
}

async function getUser(tabId: number) {
  if (readClient?.readyState() === 'OPEN') return
  await new Promise((res) =>
    chrome.tabs.sendMessage(tabId, { type: 'getUser' }, res)
  )
}

async function update(tab: chrome.tabs.Tab, active: boolean) {
  const tabId = tab?.id

  if (readClient?.readyState() === 'OPEN' && tabId) {
    if (active) {
      const channel = tab?.url?.split('/')[3] || ''
      if (
        readClient.getChannels().includes(`#${channel}`) ||
        (tabs[tabId]?.url === tab?.url && tab?.url !== undefined)
      )
        return
      if (tabs[tabId]) {
        await update(tabs[tabId], false)
      }
      await readClient.join(channel).catch(async (err) => {
        log('Error joining channel', err)
        await getUser(tabId)
      })
      log('Joining channel', channel)
      log('Channels', readClient.getChannels())
      tabs[tabId] = tab
    }
    if (!active) {
      const channel = tab?.url?.split('/')[3] || ''
      await readClient.part(channel).catch(async (err) => {
        log('Error leaving channel', err)
        await getUser(tabId)
      })
      log('Leaving channel', channel)
      delete tabs[tabId]
    }
  } else if (tabId && tab) {
    const channel = tab?.url?.split('/')[3] || ''
    if (chatsToJoin.includes(`#${channel}`) || tabs[tabId]) return
    chatsToJoin.push(channel)
  }
}

async function reconnect(notify = false) {
  if (readClient) {
    const connectedChannels = [...new Set(readClient.getChannels())].map((c) =>
      c.substring(1).toLowerCase()
    )
    const channels: string[] = []

    const tabsWithTwitch = await new Promise<chrome.tabs.Tab[]>((res) =>
      chrome.tabs.query({ url: '*://*.twitch.tv/*' }, res)
    )

    for (let i = 0; i < tabsWithTwitch.length; i++) {
      const tab = tabsWithTwitch[i]
      const channel = (tab?.url?.split('/')[3] || '').toLowerCase()
      if (!channels.includes(channel)) channels.push(channel)
    }

    const initMessage = `Checking ${channels.length} channels and ${connectedChannels.length} connected channels`

    const notificationId = notify
      ? await new Promise<string>((res) =>
          chrome.notifications.create(
            {
              type: 'basic',
              iconUrl: 'icons/pipete.png',
              title: 'TNCCE - TMI Reconnect',
              message: initMessage,
            },
            res
          )
        )
      : ''

    for (let i = 0; i < connectedChannels.length; i++) {
      const channel = connectedChannels[i]
      if (!channels.includes(channel)) {
        log('Leaving channel', channel)
        await readClient.part(channel).catch((error) => {
          log('Error leaving channel', channel, error)
        })
        await new Promise((res) => setTimeout(res, 50))
      } else {
        channels.splice(channels.indexOf(channel), 1)
      }
    }

    for (let i = 0; i < channels.length; i++) {
      const channel = channels[i]
      log('Joining channel', channel)
      await readClient.join(channel).catch((error) => {
        log('Error joining channel', channel, error)
      })
      await new Promise((res) => setTimeout(res, 50))
      connectedChannels.push(channel)
    }

    if (notify) {
      await new Promise((res) =>
        chrome.notifications.update(
          notificationId,
          {
            message: `Reconnected to ${channels.length} channels`,
          },
          res
        )
      )

      await new Promise((res) => setTimeout(res, 2000))
      await new Promise((res) =>
        chrome.notifications.clear(notificationId, res)
      )
    }
  }
}

chrome.webNavigation.onCompleted.addListener(
  async function (details) {
    const tab = await new Promise<chrome.tabs.Tab>((res) =>
      chrome.tabs.get(details.tabId, res)
    ).catch(async () => {
      await reconnect()
      return undefined
    })

    if (tab) await addTab(tab)
  },
  {
    url: [{ hostContains: 'twitch.tv' }],
  }
)

chrome.tabs.onRemoved.addListener(async function (tabId) {
  const tab = tabs[tabId]
  if (tab) {
    const channel = tab.url?.split('/')[3]
    if (channel) {
      log('Leaving channel', channel)
      await readClient?.part(channel)?.catch(async (error) => {
        log('Error leaving channel', channel, error)
        await reconnect()
      })
    }
    delete tabs[tabId]
  }
})
chrome.tabs.onUpdated.addListener(async function (_, changeInfo, tab) {
  if (changeInfo.status === 'complete' && tab?.url?.includes('twitch.tv')) {
    const cachedTab = tabs[tab.id ?? 0]
    if (cachedTab) {
      await removeTab(cachedTab)
      await addTab(tab)
    } else {
      const channel = tab?.url?.split('/')[3]
      if (channel) {
        log('Leaving channel', channel)
        await readClient?.part(channel)?.catch(async (error) => {
          log('Error leaving channel', channel, error)
          await reconnect()
        })
      }
    }
  }
})

chrome.windows.onRemoved.addListener(function (windowId) {
  if (tncceLiveChatWindow && tncceLiveChatWindow.id === windowId) {
    tncceLiveChatWindow = undefined
  }
  chrome.tabs.query({ windowId }, async function (tabs) {
    for (let i = 0; i < tabs.length; i++) {
      const tab = tabs[i]
      await removeTab(tab)
    }
  })
})

chrome.runtime.onMessage.addListener(async function (request) {
  if (request.type === 'user') {
    const twitchUser = request.user

    if (twitchUser && (!readClient || !writeClient))
      await createTmiClient(twitchUser)
    return true
  } else if (request.type === 'liveChat') {
    if (tncceLiveChatWindow && tncceLiveChatWindow.id) {
      chrome.windows.update(tncceLiveChatWindow.id, { focused: true })
      chrome.tabs.query({ windowId: tncceLiveChatWindow.id }, function (tabs) {
        if (tabs.length) {
          chrome.tabs.sendMessage(tabs[0].id || 0, {
            ...request,
            type: 'liveChat',
          })
        }
      })
    }
    return true
  }
})

const parent = chrome.contextMenus.create({
  id: 'tncce',
  title: 'TNCCE',
})

chrome.contextMenus.create({
  id: 'tncce-tmi-channels',
  title: 'TMI Channels',
  parentId: parent,
})

chrome.contextMenus.create({
  id: 'tncce-tmi-reconnect',
  title: 'TMI Reconnect',
  parentId: parent,
})

chrome.contextMenus.create({
  id: 'tncce-tmi-live-chat',
  title: 'TMI Live Chat',
  parentId: parent,
})

chrome.contextMenus.create({
  id: 'tncce-tmi-separator-1',
  type: 'separator',
  parentId: parent,
})

chrome.contextMenus.create({
  id: 'tncce-reload',
  title: 'Reload',
  parentId: parent,
})

let tncceLiveChatWindow: chrome.windows.Window | undefined

chrome.contextMenus.onClicked.addListener(async function (info, tab) {
  switch (info.menuItemId) {
    case 'tncce-reload':
      chrome.runtime.reload()
      break
    case 'tncce-tmi-channels':
      if (readClient) {
        const channels = readClient.getChannels()
        log('Channels', channels)
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/pipete.png',
          title: 'TNCCE - TMI Channels',
          message: channels.map((c) => c.substring(1)).join(', '),
        })
      }
      break
    case 'tncce-tmi-live-chat':
      if (writeClient && readClient) {
        const result: chrome.scripting.InjectionResult<Awaited<any>>[] =
          await new Promise((res) =>
            chrome.scripting.executeScript(
              {
                target: {
                  tabId: tab?.id ?? 0,
                },
                func: function () {
                  const chat = document.querySelector(
                    'section[data-test-selector="chat-room-component-layout"]'
                  )

                  const boundingRect = chat?.getBoundingClientRect()

                  return {
                    width: chat?.clientWidth,
                    height: chat?.clientHeight,
                    left: boundingRect?.left,
                    top: boundingRect?.top,
                  }
                },
              },
              res
            )
          )
        const { width, height, left, top } = result[0]?.result ?? {}
        tncceLiveChatWindow = await chrome.windows.create({
          url: chrome.runtime.getURL('livechat.html'),
          type: 'popup',
          width: width ?? 400,
          height: height ?? 600,
          left,
          top,
          focused: true,
        })
      }
      break
    case 'tncce-tmi-reconnect':
      await reconnect(true)
      break
  }
})
