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

  readClient.on('connecting', () => {
    log('Connecting ReadClient')
  })
  readClient.on('connected', async () => {
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
  if (tab.url?.includes('twitch.tv') && tab.id && !tabs[tab.id]) {
    await getUser(tab.id)
    await update(tab, true)
  }
}

async function removeTab(tabId: chrome.tabs.Tab | number) {
  let tab = typeof tabId === 'number' ? tabs[tabId] : tabId

  if (!tab && typeof tabId === 'number')
    tab = await new Promise((res) => chrome.tabs.get(tabId, res))

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

chrome.webNavigation.onCompleted.addListener(
  async function (details) {
    const tab = await new Promise<chrome.tabs.Tab>((res) =>
      chrome.tabs.get(details.tabId, res)
    )

    await addTab(tab)
  },
  {
    url: [{ hostContains: 'twitch.tv' }],
  }
)

chrome.tabs.onRemoved.addListener(removeTab)
chrome.tabs.onUpdated.addListener(async function (tabId, changeInfo, tab) {
  if (changeInfo.status === 'complete') {
    await removeTab(tabId)
    await addTab(tab)
  }
})

chrome.windows.onRemoved.addListener(function (windowId) {
  if (tncceLiveChatWindow && tncceLiveChatWindow.id === windowId) {
    tncceLiveChatWindow = undefined
  }
  chrome.tabs.query({ windowId: windowId }, function (tabs) {
    tabs.forEach(removeTab)
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
  id: 'tncce-tmi-live-chat',
  title: 'TMI Live Chat',
  parentId: parent,
})

let tncceLiveChatWindow: chrome.windows.Window | undefined

chrome.contextMenus.onClicked.addListener(async function (info, tab) {
  switch (info.menuItemId) {
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
  }
})
