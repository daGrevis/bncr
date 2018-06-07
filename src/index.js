global.Promise = require('bluebird')
const fs = require('fs')

const _ = require('lodash')
const chokidar = require('chokidar')
const toml = require('toml')
const ircFramework = require('irc-framework')
const Queue = require('promise-queue')

const CONFIG_PATH = './config.toml'

Queue.configure(Promise)

const getConfig = () => {
  const output = fs.readFileSync(CONFIG_PATH)

  let nextConfig
  try {
    nextConfig = toml.parse(output)
  } catch (e) {
    console.log(e)
    throw e
  }

  return {
    watchConfig: true,
    ...nextConfig,
    channels: _.mapValues(nextConfig.channels || [], channel => ({
      ops: channel.ops || [],
      voiced: channel.voiced || [],
      accounts: channel.accounts || [],
      kickOnJoin: channel.kickOnJoin || [],
      kickIgnores: channel.kickIgnores || [],
      kickPatterns: channel.kickPatterns || {},
    })),
  }
}

let config = getConfig()

if (config.watchConfig) {
  console.log('Watching config...')
  chokidar.watch(CONFIG_PATH, { awaitWriteFinish: true }).on('change', () => {
    try {
      config = getConfig()
      console.log('Config reloaded!')
    } catch (e) {}
  })
}

const irc = new ircFramework.Client({
  host: config.host,
  port: config.port,
  tls: config.tls,
  nick: config.nick,
  username: config.username,
  password: config.password,
  auto_reconnect: true,
  // Tries to reconnect for at least 5 hours.
  auto_reconnect_wait: 2000 + Math.round(Math.random() * 2000),
  auto_reconnect_max_retries: 9000,
})

const isOpAcquired = {}

const setUserModes = (channelId, nick, isOpAlready = false, isVoicedAlready = false) => {
  if (!isOpAcquired[channelId]) {
    return
  }

  const channelConfig = config.channels[channelId]

  if (!channelConfig) {
    return
  }

  if (!isOpAlready && _.includes(channelConfig.ops, nick)) {
    irc.whois(nick, event => {
      const foundAccount = _.find(
        channelConfig.accounts,
        ([accountNick]) => accountNick === nick,
      )
      const account = foundAccount ? foundAccount[1] : nick

      if (event.account !== account) {
        return
      }

      console.log(`Setting +o on ${nick} at ${channelId}...`)
      irc.raw('MODE', channelId, '+o', nick)
    })
  }

  if (!isVoicedAlready && _.includes(channelConfig.voiced, nick)) {
    console.log(`Setting +v on ${nick} at ${channelId}...`)
    irc.raw('MODE', channelId, '+v', nick)
  }
}

const kick = (channelId, nick) => {
  console.log(`Kicking ${nick} from ${channelId}...`)
  irc.raw('KICK', channelId, nick)
}

const onClose = async (err) => {
  console.log('Connection to IRC server was closed!')
}

const onConnecting = async () => {
  console.log('Connecting to IRC server...')
}

const onRegistered = async () => {
  console.log('Connected to IRC server!')

  _.forEach(config.channels, (channel, channelId) => {
    console.log(`Joining ${channelId}...`)

    irc.join(channelId)
  })
}

const onJoin = async (payload) => {
  if (payload.nick === irc.user.nick) {
    console.log(`Joined ${payload.channel}!`)

    irc.raw('MODE', payload.channel, '+o', irc.user.nick)
  } else {
    if (_.includes(config.channels[payload.channel].kickOnJoin, payload.nick)) {
      kick(payload.channel, payload.nick)
      return
    }

    setUserModes(payload.channel, payload.nick)
  }
}

const onNick = async (payload) => {
  _.forEach(config.channels, (channel, channelId) => {
    setUserModes(channelId, payload.new_nick)
  })
}

const onMode = async (payload) => {
  const botOp = _.find(payload.modes, {
    mode: '+o',
    param: irc.user.nick,
  })
  if (botOp && !isOpAcquired[payload.target]) {
    isOpAcquired[payload.target] = true

    irc.raw('NAMES', payload.target)
  }
}

const onUserList = async (payload) => {
  if (!isOpAcquired[payload.channel]) {
    return
  }

  _.forEach(payload.users, ({ nick, modes }) => {
    const isOpAlready = _.includes(modes, 'o')
    const isVoicedAlready = _.includes(modes, 'v')
    setUserModes(payload.channel, nick, isOpAlready, isVoicedAlready)
  })
}

const onKick = async (payload) => {
  if (irc.user.nick === payload.kicked) {
    console.log(`Kicked by ${payload.nick}, rejoining ${payload.channel}!`)

    isOpAcquired[payload.channel] = false

    irc.join(payload.channel)
  }
}

const onMessage = async (payload) => {
  const channelId = payload.target

  if (!isOpAcquired[channelId]) {
    return
  }

  const channelConfig = config.channels[channelId]

  if (!channelConfig) {
    return
  }

  if (_.includes(channelConfig.kickIgnores, payload.nick)) {
    return
  }

  const kickPatterns = _.concat(
    channelConfig.kickPatterns['*'] || [],
    channelConfig.kickPatterns[payload.nick] || [],
  )
  for (const pattern of kickPatterns) {
    const regExp = new RegExp(pattern)
    if (regExp.test(payload.message)) {
      kick(channelId, payload.nick)
      break
    }
  }
}

const eventMap = {
  close: onClose,
  connecting: onConnecting,
  registered: onRegistered,
  join: onJoin,
  nick: onNick,
  mode: onMode,
  userlist: onUserList,
  kick: onKick,
  privmsg: onMessage,
}

const eventQueue = new Queue(1, Infinity)
_.forEach(eventMap, (fn, name) => {
  irc.on(name, payload => {
    eventQueue.add(() => fn(payload))
  })
})

irc.connect()
