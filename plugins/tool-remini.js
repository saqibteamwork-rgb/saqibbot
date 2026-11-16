// plugins/tool-remini.js - Fast & Reliable HD Image Enhancer using Sharp
'use strict';

const sharp = require('sharp');
const { cmd } = require("../command");

cmd({
  pattern: "remini",
  alias: ["enhance", "hd", "upscale"],
  react: '✨',
  desc: "Enhance photo quality to HD using Sharp Engine",
  category: "utility",
  use: ".remini [reply to image]",
  filename: __filename
}, async (client, message, { reply, quoted }) => {
  try {
    const quotedMsg = quoted || message;
    const mimeType = (quotedMsg.msg || quotedMsg).mimetype || '';
    
    if (!mimeType || (!mimeType.startsWith('image/') && !mimeType.includes('webp'))) {
      return reply("Please reply to an image or sticker (JPEG/PNG/WebP)");
    }

    const mediaBuffer = await quotedMsg.download();
    if (!mediaBuffer || mediaBuffer.length === 0) {
      return reply("❌ Failed to download media.");
    }

    const enhancedBuffer = await sharp(mediaBuffer, { pages: 1 })
      .sharpen({ sigma: 1.5, m1: 1.3, m2: 0.7 })
      .normalize()
      .modulate({ brightness: 1.04, saturation: 1.08 })
      .jpeg({ quality: 95 })
      .toBuffer();

    await client.sendMessage(message.chat, {
      image: enhancedBuffer,
      caption: "- *✅ Image enhanced successfully (HD Quality)*\n\n🚀 _MR SAQIB MD_",
    }, { quoted: message });

  } catch (error) {
    console.error('Image Enhancement Error:', error);
    await reply(`❌ Error: ${error.message || "Failed to enhance image."}`);
  }
});
