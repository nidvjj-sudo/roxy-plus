module.exports = {
    name: 'help',
    category: 'Utility',
    description: 'List commands or categories',
    async execute(message, args, client) {
        const commands = Array.from(client.commands.values());
        const categories = {};

        // Sort commands into categories
        commands.forEach(cmd => {
            let cat = cmd.category || 'Utility';
            // Auto-assign Music category for known commands if property missing
            if (['play', 'stop', 'skip', 'queue', 'join', 'left'].includes(cmd.name)) cat = 'Music';

            // Ensure Purge/DM are Utility (though set in file)
            if (['purge', 'dm'].includes(cmd.name)) cat = 'Utility';

            if (!categories[cat]) categories[cat] = [];
            categories[cat].push(cmd);
        });

        // Inject Clipboard Help
        if (categories['Utility']) {
            categories['Utility'].push({
                name: '<trigger>',
                description: 'Custom Clipboard Trigger'
            });
            categories['Utility'].push({
                name: '<math>',
                description: 'Calculator (e.g. 5+5)'
            });
            categories['Utility'].push({
                name: '<currency>',
                description: 'Fiat Exchange (e.g. 10 usd to inr)'
            });
            categories['Utility'].push({
                name: '<qr>',
                description: 'QR Code Manager (type "qr")'
            });
        }

        let replyMsg = null;

        // 1. Show Specific Category
        if (args[0]) {
            const catName = Object.keys(categories).find(c => c.toLowerCase() === args[0].toLowerCase());
            if (catName) {
                let msg = '```\n';
                msg += `╭─[ ${catName.toUpperCase()} COMMANDS ]─╮\n\n`;
                categories[catName].forEach(cmd => {
                    msg += `  • ${cmd.name.padEnd(10)} - ${cmd.description || 'No description'}\n`;
                });
                msg += '\n╰──────────────────────────────────╯\n```';
                replyMsg = await message.reply(msg);
            } else {
                replyMsg = await message.reply('Category not found. Type !help for list.');
            }
        } else {
            // 2. Show All Categories (Main Menu)
            let helpMessage = '```\n';
            helpMessage += '╭─[ ROXY+ HELP ]─╮\n\n';
            helpMessage += '  Available Categories:\n\n';

            Object.keys(categories).forEach(cat => {
                helpMessage += `  📂 ${cat} (Type !help ${cat.toLowerCase()})\n`;
            });

            helpMessage += '\n╰──────────────────────────────────╯\n```';
            replyMsg = await message.reply(helpMessage);
        }

        // Auto Delete after 15 seconds
        if (replyMsg) {
            setTimeout(() => {
                replyMsg.delete().catch(() => { });
            }, 15000);
        }
    }
};
