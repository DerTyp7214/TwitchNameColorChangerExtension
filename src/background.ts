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

  log('Connecting TMI Clients')
  await readClient.connect()
  await writeClient.connect()

  log('Joining channels')
  for (let i = 0; i < chatsToJoin.length; i++) {
    const channel = chatsToJoin.pop()
    log('Joining channel', channel)
    if (channel) await readClient.join(channel)
    await new Promise((res) => setTimeout(res, 50))
  }

  log('Adding listeners')
  addListeners()
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
    tabs[tab.id] = tab
    await getUser(tab.id)
    await update(tab.id, true)
  }
}

async function removeTab(tab: chrome.tabs.Tab | number) {
  const tabId = typeof tab === 'number' ? tab : tab.id

  if (tabId && tabs[tabId]) {
    await update(tabId, false)
    delete tabs[tabId]
  }
}

async function getUser(tabId: number) {
  if (readClient?.readyState() === 'OPEN') return
  await new Promise((res) =>
    chrome.tabs.sendMessage(tabId, { type: 'getUser' }, res)
  )
}

async function update(tabId: number, active: boolean) {
  if (readClient?.readyState() === 'OPEN') {
    if (active) {
      await readClient.join(tabs[tabId]?.url?.split('/')[3] || '')
      log('Joining channel', tabs[tabId]?.url?.split('/')[3] || '')
      log('Channels', readClient.getChannels())
    }
    if (!active) {
      await readClient.part(tabs[tabId]?.url?.split('/')[3] || '')
      log('Leaving channel', tabs[tabId]?.url?.split('/')[3] || '')
    }
  } else chatsToJoin.push(tabs[tabId].url?.split('/')[3] || '')
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
  if (changeInfo.status === 'complete' && changeInfo.url !== tabs[tabId]?.url) {
    await removeTab(tabId)
    await addTab(tab)
  }
})

chrome.windows.onRemoved.addListener(function (windowId) {
  chrome.tabs.query({ windowId: windowId }, function (tabs) {
    tabs.forEach(removeTab)
  })
})

chrome.runtime.onMessage.addListener(async function (request) {
  if (request.type === 'user') {
    const twitchUser = request.user

    if (twitchUser) await createTmiClient(twitchUser)
    return true
  }
})
