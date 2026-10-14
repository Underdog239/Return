import settings from '../settings.js';

export async function addBrowserViewer(bot, count_id) {
    if (!settings.render_bot_view) return;
    try {
        const prismarineViewer = (await import('prismarine-viewer')).default;
        const mineflayerViewer = prismarineViewer.mineflayer;
        mineflayerViewer(bot, {
            port: 3000 + count_id,
            firstPerson: true,
            viewDistance: 8
        });
        console.log(`Bot view (camera) available on port ${3000 + count_id}`);
    } catch (err) {
        console.error(`Camera unavailable: ${err.message}`);
        console.error('The bot will continue without the live camera view.');
    }
}
