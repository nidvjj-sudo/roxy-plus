const { joinVoiceChannel } = require('@discordjs/voice');

function createIdentifier(query) {
    return /^(https?:\/\/|www\.)/i.test(query)
        ? query
        : `ytmsearch:${query}`;
}

function formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
        return `${hours}:${String(minutes % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    }
    return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

async function playLogic(client, guildId, query) {
    const identifier = createIdentifier(query);
    let result;

    try {
        result = await client.lavalink.loadTracks(identifier);
    } catch (e) {
        return { success: false, reason: e.message };
    }

    if (result.loadType === 'empty')
        return { success: false, reason: 'No results found' };

    if (result.loadType === 'error')
        return { success: false, reason: result.data.message || 'Lavalink Error' };

    let queue = client.queueManager.get(guildId);
    if (!queue) queue = client.queueManager.create(guildId);

    const voiceState = client.voiceStates[guildId];
    if (!voiceState || !voiceState.token) {
        return { success: false, reason: 'Bot not connected to voice' };
    }

    // =========================
    // 🎵 PLAYLIST
    // =========================
    if (result.loadType === 'playlist') {
        const tracks = result.data.tracks;

        for (const track of tracks) {
            client.queueManager.addSong(guildId, track);
        }

        if (!queue.nowPlaying && tracks.length > 0) {
            const firstTrack = tracks[0];

            queue.nowPlaying = firstTrack;
            queue.position = 0;
            queue.lastUpdate = Date.now();

            await client.lavalink.updatePlayer(guildId, firstTrack, voiceState, {
                volume: queue.volume,
                filters: queue.filters
            });
        }

        return {
            success: true,
            type: 'playlist',
            tracksCount: tracks.length,
            playlistName: result.data.info?.name || 'Unknown Playlist'
        };
    }

    // =========================
    // 🎵 SINGLE TRACK / SEARCH
    // =========================
    let track;

    if (result.loadType === 'track') {
        track = result.data;
    } else if (result.loadType === 'search') {
        track = result.data[0];
    }

    if (!track)
        return { success: false, reason: 'No track found' };

    if (queue.nowPlaying) {
        client.queueManager.addSong(guildId, track);
        return { success: true, type: 'queue', track };
    }

    queue.nowPlaying = track;
    queue.position = 0;
    queue.lastUpdate = Date.now();

    await client.lavalink.updatePlayer(guildId, track, voiceState, {
        volume: queue.volume,
        filters: queue.filters
    });

    return { success: true, type: 'play', track };
}

module.exports = {
    name: 'play',
    description: 'Play a song from YouTube or search query',
    playLogic,

    async execute(message, args, client) {
        if (!message.guild)
            return message.channel.send('```This command only works in servers```');

        const vc = message.member?.voice?.channel;
        if (!vc)
            return message.channel.send('```You need to be in a voice channel```');

        if (!args.length)
            return message.channel.send('```Please provide a song name or URL```');

        try {
            // Join voice
            joinVoiceChannel({
                channelId: vc.id,
                guildId: vc.guild.id,
                adapterCreator: vc.guild.voiceAdapterCreator,
                selfDeaf: false,
            });

            await new Promise(r => setTimeout(r, 1000));

            const result = await playLogic(
                client,
                message.guild.id,
                args.join(' ')
            );

            if (!result.success)
                return message.channel.send(`\`\`\`Error: ${result.reason}\`\`\``);

            // =========================
            // PLAYLIST RESPONSE
            // =========================
            if (result.type === 'playlist') {
                return message.channel.send(`\`\`\`
╭─[ PLAYLIST ADDED ]─╮

  ${result.playlistName}
  Added: ${result.tracksCount} tracks

╰────────────────────╯
\`\`\``);
            }

            // =========================
            // QUEUE RESPONSE
            // =========================
            if (result.type === 'queue') {
                const position =
                    client.queueManager.get(message.guild.id).songs.length;

                return message.channel.send(`\`\`\`

  ${result.track.info.title}
  ${result.track.info.author}
  Position: ${position}
\`\`\``);
            }

            // =========================
            // NOW PLAYING RESPONSE
            // =========================
            if (result.type === 'play') {
                message.channel.send(`\`\`\`

  ${result.track.info.title}
  ${result.track.info.author}
  ${formatDuration(result.track.info.length)}
\`\`\``);

                const queue = client.queueManager.get(message.guild.id);
                if (queue) queue.textChannel = message.channel;
            }

            if (message.deletable)
                message.delete().catch(() => { });

        } catch (err) {
            console.error('[Play Error]:', err);
            message.channel.send(`\`\`\`js
❌ Error: ${err.message}
\`\`\``);
        }
    },
};
