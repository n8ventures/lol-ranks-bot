const i18n = require('i18n')
const { MessageActionRow, MessageButton } = require('discord.js')
const { SlashCommands } = require('./slash-commands')
const { LoLRanks } = require('./lol-ranks')
const { Roles } = require('./roles')
const { DbHandler } = require('./data-handlers/db-handler')
const { ApiHandler } = require('./data-handlers/api-handler')

class Events {
  constructor(client, db, limiter, config) {
    this.config = config
    this.db = db
    this.limiter = limiter
    this.client = client
    this.apiHandler = ApiHandler.getInstance(this.config)
    this.dbHandler = DbHandler.getInstance(this.db)
    this.init()
  }

  init() {
    console.log('Initializing events')

    // This should be logged when the bot is fully ready
    this.client.once('ready', async () => {
      console.log('Ready!')

      try {
        this.client.user.setActivity(this.config.status, { type: 'PLAYING' })

        // Init modules
        const roles = new Roles(this.client, this.config)
        await roles.init()
        this.lolRanks = new LoLRanks(
          this.client,
          this.config,
          this.db,
          this.limiter,
          roles
        )
        const slashCommands = new SlashCommands(
          this.config,
          this.client.application.id
        )
        await slashCommands.init()
        console.log('Modules initialized successfully')
      } catch (error) {
        console.error('Error initializing modules:', error)
      }
    })

    this.client.on('interactionCreate', async (interaction) => {
      if (
        interaction.isButton() &&
        interaction.component.label === i18n.__('confirm')
      ) {
        const player = this.dbHandler.getPlayerByDiscordId(interaction.user.id)

        const riotIdData = await this.apiHandler.getRiotId({
          value: player.summonerID,
          type: 'summonerID'
        })

        // const getSummonerPuuid = await this.apiHandler.getSummonerPuuid({
        //   value: player.summonerEID,
        //   type: 'summonerEID'
        // })

        const riotId = riotIdData.puuid

        this.executeCommand('rank', riotId, interaction, i18n.__('confirm'))
      }

      if (interaction.isCommand() && interaction.commandName === 'rank') {
        this.executeCommand(
          'rank',
          interaction.options.data[0].value,
          interaction,
          i18n.__('confirm')
        )
      }
    })
  }

  executeCommand(name, args, message, buttonText = null) {
    switch (name) {
    case 'rank':
      this.rankCommand({ value: args, type: 'riotId' }, message, buttonText)
      break
    default:
      break
    }
  }

  rankCommand(args, message, buttonText) {
    if (Array.isArray(args)) args.shift()

    this.limiter
      .schedule(async () => {
        const reply = await this.lolRanks.setRoleByRank(message, args)

        if (!reply) return { reply: null }

        const data =
          reply === i18n.__('reply8') ||
          reply.includes(i18n.__('reply4_1')) ||
          reply.includes(i18n.__('reply5_1'))
            ? { reply, isButton: false }
            : { reply, isButton: true }

        return data
      })
      .then(({ reply, isButton }) => {
        if (!reply) return

        const row = new MessageActionRow()
        row.addComponents(
          new MessageButton()
            .setCustomId('primary')
            .setLabel(buttonText ?? '')
            .setStyle('PRIMARY')
        )

        try {
          message.reply(
            isButton && buttonText
              ? { content: reply, components: [row] }
              : reply
          )
        } catch (error) {
          console.trace('Failed to reply in rank command', error)
        }
      })
      .catch((warning) => console.warn(warning))
  }
}

module.exports = {
  Events
}
