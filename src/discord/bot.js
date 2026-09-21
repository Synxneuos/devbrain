// ================================================================
// JEV BRAIN — AUTONOMOUS DISCORD AGENT WARDEN & SECURITY SENTINEL
// ================================================================
// Features:
// 1. Rogue Mod & Unauthorized Launch Shield (Deletes unauthorized launch announcements,
//    strips mod roles from rogue mods, DMs server owner instantly).
// 2. Strict Anti-Attachment / Anti-Image Protocol (Normal members can only send text).
// 3. Strict Anti-Link / Anti-Phishing Protocol (No external links allowed for regular members).
// 4. Autonomous Scam/FUD Firewall with 12-Hour Timeout.
// 5. Unpin Guard (Unpins unauthorized announcements).
// 6. Automated Role & #verify-here Channel Setup.
// 7. On-chain Verified Token Holder Role Synchronization.
// ================================================================

import { Client, GatewayIntentBits, Partials, PermissionsBitField, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

try {
  const envPath = path.join(__dirname, '..', '..', '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    for (const rawLine of envContent.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eqIdx = line.indexOf('=');
      if (eqIdx > 0) {
        const key = line.slice(0, eqIdx).trim();
        const val = line.slice(eqIdx + 1).trim();
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
} catch {}

export const OFFICIAL_TOKEN_CA = (process.env.TOKEN_CONTRACT_ADDRESS || 'AxwSUUHx6hj8bgdtSxVUiKtKkZwmcDbNbEEtTvzfpump').trim();

// Target Server Configuration
export const DISCORD_CONFIG = {
  get clientId() { return (process.env.DISCORD_CLIENT_ID || '1551686988145491978').trim(); },
  get clientSecret() { return (process.env.DISCORD_CLIENT_SECRET || '').trim(); },
  get botToken() { return (process.env.DISCORD_BOT_TOKEN || '').trim(); },
  get guildId() { return (process.env.DISCORD_GUILD_ID || '1551685785432883332').trim(); },
  get officialCA() { return OFFICIAL_TOKEN_CA; },
  get verifyUrl() { return process.env.SITE_URL ? `${process.env.SITE_URL}/verify.html` : 'http://localhost:3333/verify.html'; }
};

// 2 Unique Thematic Moderation Roles + 5 Holding Tier Roles
export const SERVER_ROLES = [
  // High-Court Authority
  {
    name: 'Neural Arbiter',
    color: 0x7C3AED, // Electric Purple
    hoist: true,
    permissions: [
      PermissionsBitField.Flags.BanMembers,
      PermissionsBitField.Flags.KickMembers,
      PermissionsBitField.Flags.ModerateMembers,
      PermissionsBitField.Flags.ManageMessages,
      PermissionsBitField.Flags.ViewAuditLog,
      PermissionsBitField.Flags.ManageRoles
    ]
  },
  // Field Security Guard
  {
    name: 'Agent Warden',
    color: 0x0284C7, // Cyan Blue
    hoist: true,
    permissions: [
      PermissionsBitField.Flags.KickMembers,
      PermissionsBitField.Flags.ModerateMembers,
      PermissionsBitField.Flags.ManageMessages,
      PermissionsBitField.Flags.ViewAuditLog
    ]
  },
  // Tier 5 Token Holder
  {
    name: 'Dynasty Magnate',
    color: 0xF59E0B, // Amber Gold
    hoist: true,
    permissions: []
  },
  // Tier 4 Token Holder
  {
    name: 'Syndicate Director',
    color: 0x10B981, // Emerald Green
    hoist: true,
    permissions: []
  },
  // Tier 3 Token Holder
  {
    name: 'Principal Partner',
    color: 0x6366F1, // Indigo
    hoist: false,
    permissions: []
  },
  // Tier 2 Token Holder
  {
    name: 'Charter Associate',
    color: 0x64748B, // Slate
    hoist: false,
    permissions: []
  },
  // Tier 1 Token Holder
  {
    name: 'Reserve Initiate',
    color: 0x71717A, // Zinc
    hoist: false,
    permissions: []
  },
  // Base Verified Role
  {
    name: 'Verified Token Holder',
    color: 0x059669, // Forest Green
    hoist: false,
    permissions: []
  }
];

// Rogue Launch Announcement Patterns
const ROGUE_LAUNCH_PATTERNS = [
  /dev\s+(is\s+)?(launching|dropping|deploying|releasing)/i,
  /new\s+(token|ca|contract|pump|coin)/i,
  /stealth\s+launch/i,
  /presale(\s+live)?/i,
  /fair\s+launch/i,
  /airdrop(\s+live|\s+claim|\s+now)/i,
  /migration\s+(to|live)/i,
  /pump\.fun\/(?!AxwSUUHx6hj8bgdtSxVUiKtKkZwmcDbNbEEtTvzfpump)[a-zA-Z0-9]{32,44}/i
];

// Scam & Malicious Phishing Patterns
const SCAM_PATTERNS = [
  /\b(scam|fake|rug|honeypot|drainer|phishing)\b/i,
  /claim\s+your\s+tokens/i,
  /connect\s+wallet\s+to\s+claim/i,
  /dm\s+(me\s+)?for\s+(support|help)/i,
  /seed\s+phrase|private\s+key/i
];

// Link URL Regex
const URL_REGEX = /(https?:\/\/[^\s]+|discord\.gg\/[^\s]+|t\.me\/[^\s]+)/i;

export class JevDiscordBot {
  constructor(config = DISCORD_CONFIG) {
    this.config = config;
    this.client = null;
    this.guild = null;
  }

  ensureClient() {
    if (!this.client) {
      this.client = new Client({
        intents: [
          GatewayIntentBits.Guilds,
          GatewayIntentBits.GuildMembers,
          GatewayIntentBits.GuildMessages,
          GatewayIntentBits.MessageContent,
          GatewayIntentBits.DirectMessages
        ],
        partials: [Partials.Message, Partials.Channel]
      });
      this.setupListeners();
    }
    return this.client;
  }

  async start() {
    if (!this.config.botToken) {
      console.warn('[DiscordBot] No botToken configured.');
      return;
    }
    try {
      this.ensureClient();
      await this.client.login(this.config.botToken);
      console.log(`[DiscordBot] ✓ Logged in as ${this.client.user.tag}`);
    } catch (err) {
      console.error('[DiscordBot] Login failed:', err.message);
    }
  }

  async stop() {
    if (this.client) {
      await this.client.destroy();
      this.client = null;
      this.guild = null;
    }
  }

  setupListeners() {
    if (!this.client) return;
    this.client.once('clientReady', async () => {
      console.log(`[DiscordBot] Sentinel Active. Connected to Discord Gateway.`);
      await this.initGuild();
    });

    // Automatically initialize when invited to target guild in real time
    this.client.on('guildCreate', async (guild) => {
      if (guild.id === this.config.guildId) {
        console.log(`[DiscordBot] ✓ Joined target guild: "${guild.name}" (${guild.id})! Initializing roles and verification channels...`);
        this.guild = guild;
        await this.ensureRolesExist();
        await this.ensureVerifyChannel();
      }
    });

    // Real-time message interceptor (Firewall)
    this.client.on('messageCreate', async (message) => {
      await this.handleMessage(message);
    });

    // Pinned announcement guardian
    this.client.on('channelPinsUpdate', async (channel) => {
      await this.handlePinUpdate(channel);
    });
  }

  async initGuild() {
    try {
      this.guild = await this.client.guilds.fetch(this.config.guildId).catch(() => null);
      if (!this.guild) {
        console.warn(`[DiscordBot] Guild ${this.config.guildId} not found. Ensure bot is invited.`);
        return;
      }

      console.log(`[DiscordBot] Managing Guild: "${this.guild.name}" (ID: ${this.guild.id})`);
      await this.ensureRolesExist();
      await this.ensureVerifyChannel();
    } catch (err) {
      console.error('[DiscordBot] Init guild error:', err.message);
    }
  }

  async ensureRolesExist() {
    if (!this.guild) return;
    try {
      const existingRoles = await this.guild.roles.fetch();
      for (const roleDef of SERVER_ROLES) {
        const found = existingRoles.find(r => r.name.toLowerCase() === roleDef.name.toLowerCase());
        if (!found) {
          console.log(`[DiscordBot] Creating server role: "${roleDef.name}"...`);
          await this.guild.roles.create({
            name: roleDef.name,
            color: roleDef.color,
            hoist: roleDef.hoist,
            permissions: roleDef.permissions,
            reason: 'Jev Brain Automated Role Initialization'
          });
        }
      }
      console.log('[DiscordBot] ✓ All 8 thematic roles verified and active.');
    } catch (err) {
      console.error('[DiscordBot] Role creation error:', err.message);
    }
  }

  async ensureVerifyChannel() {
    if (!this.guild) return;
    try {
      const channels = await this.guild.channels.fetch();
      let verifyChan = channels.find(c => c.name === 'verify-here' || c.name === 'token-verify');

      if (!verifyChan) {
        console.log('[DiscordBot] Creating #verify-here channel...');
        verifyChan = await this.guild.channels.create({
          name: 'verify-here',
          topic: 'Verified $JEVBRAIN Token Holding Portal & Autonomous Access Gateway',
          reason: 'Automated verification channel setup'
        });

        const embed = new EmbedBuilder()
          .setTitle('✻ Jev Brain — Autonomous Token Verification')
          .setDescription(
            `Welcome to **Jev Brain Official Discord**.\n\n` +
            `This server is protected by **Agent Warden Sentinel**. Only verified token holders gain access to Frontier AI channels, projects, and autonomous agent testbeds.\n\n` +
            `**Official Contract Address (Solana):**\n` +
            `\`${this.config.officialCA}\`\n\n` +
            `Click the button below to connect your Phantom wallet and claim your tier role.`
          )
          .setColor(0x09090B)
          .setFooter({ text: 'Jev Brain Autonomous Security • 24/7 Always Active' });

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setLabel('Verify Token Holding →')
            .setStyle(ButtonStyle.Link)
            .setURL(this.config.verifyUrl)
        );

        await verifyChan.send({ embeds: [embed], components: [row] });
      }
    } catch (err) {
      console.error('[DiscordBot] Channel setup error:', err.message);
    }
  }

  async handleMessage(message) {
    // Ignore bot messages and DMs
    if (message.author.bot || !message.guild) return;

    const content = message.content || '';
    const member = message.member;
    const isOwner = message.author.id === message.guild.ownerId;
    const isMod = member && (
      member.permissions.has(PermissionsBitField.Flags.Administrator) ||
      member.roles.cache.some(r => r.name === 'Neural Arbiter' || r.name === 'Agent Warden')
    );

    // ================================================================
    // RULE 1: ROGUE MOD / UNAUTHORIZED TOKEN LAUNCH SHIELD
    // ================================================================
    const isRogueLaunch = ROGUE_LAUNCH_PATTERNS.some(regex => regex.test(content));
    // Any unapproved contract address (other than official AxwSUU...)
    const hasUnapprovedCA = /[1-9A-HJ-NP-Za-km-z]{32,44}/.test(content) && !content.includes(this.config.officialCA);

    if ((isRogueLaunch || hasUnapprovedCA) && !isOwner) {
      try {
        await message.delete();
        console.warn(`[DEFENSE-TRIGGERED] Rogue Token Announcement intercepted from ${message.author.tag} in #${message.channel.name}`);

        // If author has mod privileges, strip them immediately!
        if (isMod) {
          const modRoles = member.roles.cache.filter(r => 
            r.name === 'Neural Arbiter' || 
            r.name === 'Agent Warden' || 
            r.permissions.has(PermissionsBitField.Flags.Administrator) ||
            r.permissions.has(PermissionsBitField.Flags.ManageGuild) ||
            r.permissions.has(PermissionsBitField.Flags.KickMembers)
          );

          if (modRoles.size > 0) {
            await member.roles.remove(modRoles, 'Agent Warden: Unauthorized Token Launch / Rogue Moderator Action Detected');
            console.log(`[DEFENSE-TRIGGERED] Stripped ${modRoles.size} moderation role(s) from rogue mod: ${message.author.tag}`);
          }
        }

        // Send alert DM to Server Owner immediately!
        await this.notifyOwner({
          title: '🚨 CRITICAL SECURITY ALERT: Rogue Launch Intercepted',
          color: 0xEF4444,
          fields: [
            { name: 'User', value: `${message.author.tag} (<@${message.author.id}>)` },
            { name: 'Channel', value: `#${message.channel.name}` },
            { name: 'Reason', value: 'Unauthorized Token Launch / Unapproved Contract Address Detected' },
            { name: 'Message Content', value: `\`\`\`${content.slice(0, 800)}\`\`\`` },
            { name: 'Action Taken', value: isMod ? 'Message Deleted + Moderator Roles STRIPPED instantly.' : 'Message Deleted.' }
          ]
        });

        // Temporary channel warning
        const warn = await message.channel.send(`🛡️ **Agent Warden:** Unauthorized token launch / contract announcements are strictly prohibited. Message removed and action reported to Server Owner.`);
        setTimeout(() => warn.delete().catch(() => {}), 6000);
        return;
      } catch (err) {
        console.error('[DiscordBot] Error handling rogue launch:', err.message);
      }
    }

    // ================================================================
    // RULE 2: SCAM / FUD AUTO-FILTER WITH 12-HOUR TIMEOUT
    // ================================================================
    const isScam = SCAM_PATTERNS.some(regex => regex.test(content));
    if (isScam && !isOwner) {
      try {
        await message.delete();
        // 12-hour timeout = 12 * 60 * 60 * 1000 ms
        const timeoutMs = 12 * 60 * 60 * 1000;
        await member.timeout(timeoutMs, 'Agent Warden Firewall: Prohibited Scam/FUD Keywords');

        await this.notifyOwner({
          title: '⚠️ Scam / FUD Offender Muted (12 Hours)',
          color: 0xF59E0B,
          fields: [
            { name: 'User', value: `${message.author.tag} (<@${message.author.id}>)` },
            { name: 'Channel', value: `#${message.channel.name}` },
            { name: 'Duration', value: '12 Hours Timeout' },
            { name: 'Flagged Content', value: `\`\`\`${content.slice(0, 500)}\`\`\`` }
          ]
        });

        const warn = await message.channel.send(`🔇 **Agent Warden:** <@${message.author.id}> has been muted for **12 Hours** for posting prohibited scam/FUD keywords.`);
        setTimeout(() => warn.delete().catch(() => {}), 6000);
        return;
      } catch (err) {
        console.error('[DiscordBot] Error applying scam timeout:', err.message);
      }
    }

    // ================================================================
    // RULE 3: REGULAR MEMBERS RESTRICTION — TEXT ONLY (NO ATTACHMENTS/IMAGES)
    // ================================================================
    if (!isMod && !isOwner) {
      if (message.attachments.size > 0) {
        try {
          await message.delete();
          const warn = await message.channel.send(`⚠️ <@${message.author.id}>, media and file attachments are restricted to verified moderators. Only text is permitted.`);
          setTimeout(() => warn.delete().catch(() => {}), 4000);
          return;
        } catch (err) {}
      }

      // ================================================================
      // RULE 4: REGULAR MEMBERS RESTRICTION — NO LINKS ALLOWED
      // ================================================================
      if (URL_REGEX.test(content)) {
        try {
          await message.delete();
          const warn = await message.channel.send(`⚠️ <@${message.author.id}>, external links are prohibited to protect members against phishing.`);
          setTimeout(() => warn.delete().catch(() => {}), 4000);
          return;
        } catch (err) {}
      }
    }
  }

  async handlePinUpdate(channel) {
    try {
      const pins = await channel.messages.fetchPinned();
      for (const msg of pins.values()) {
        const isOwner = msg.author.id === channel.guild.ownerId;
        const isRogue = ROGUE_LAUNCH_PATTERNS.some(r => r.test(msg.content));
        if (isRogue && !isOwner) {
          await msg.unpin();
          await msg.delete();
          await this.notifyOwner({
            title: '🚨 CRITICAL: Unauthorized Pinned Message Removed',
            color: 0xEF4444,
            fields: [
              { name: 'Channel', value: `#${channel.name}` },
              { name: 'Author', value: `${msg.author.tag} (<@${msg.author.id}>)` },
              { name: 'Content', value: `\`\`\`${msg.content.slice(0, 500)}\`\`\`` },
              { name: 'Action Taken', value: 'Unpinned and deleted automatically.' }
            ]
          });
        }
      }
    } catch (err) {
      console.error('[DiscordBot] Pin check error:', err.message);
    }
  }

  async notifyOwner({ title, color, fields }) {
    try {
      if (!this.guild) return;
      const owner = await this.guild.fetchOwner();
      if (!owner) return;

      const embed = new EmbedBuilder()
        .setTitle(title)
        .setColor(color || 0x09090B)
        .setTimestamp()
        .addFields(fields);

      await owner.send({ embeds: [embed] }).catch((e) => {
        console.warn('[DiscordBot] Could not DM owner:', e.message);
      });
    } catch (err) {
      console.error('[DiscordBot] notifyOwner failed:', err.message);
    }
  }

  /**
   * Assign Discord Role upon successful on-chain Solana verification
   */
  async grantVerifiedRole(discordUserId, tierName = 'Dynasty Magnate') {
    this.ensureClient();
    if (!this.guild) {
      this.guild = await this.client.guilds.fetch(this.config.guildId).catch(() => null);
    }
    if (!this.guild) throw new Error('Guild not available');

    const member = await this.guild.members.fetch(discordUserId).catch(() => null);
    if (!member) throw new Error('Discord member not found in server. Please join the Discord server first.');

    const roles = await this.guild.roles.fetch();
    const verifiedRole = roles.find(r => r.name.toLowerCase() === 'verified token holder');
    const tierRole = roles.find(r => r.name.toLowerCase() === tierName.toLowerCase());

    const toAdd = [];
    if (verifiedRole) toAdd.push(verifiedRole);
    if (tierRole) toAdd.push(tierRole);

    if (toAdd.length > 0) {
      await member.roles.add(toAdd, `Jev Brain On-Chain Solana Verification: Tier [${tierName}]`);
      console.log(`[DiscordBot] ✓ Assigned roles to ${member.user.tag}: ${toAdd.map(r => r.name).join(', ')}`);
    }

    return {
      success: true,
      user: member.user.tag,
      rolesAssigned: toAdd.map(r => r.name)
    };
  }
}

// Instantiate singleton
export const discordBot = new JevDiscordBot();
