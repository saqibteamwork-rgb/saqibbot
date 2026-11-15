'use strict';

/**
 * Command: .chautoreact / .autoreactch / .afreact
 * User Followed Channels Auto-Reaction Control & Management
 */

const userChannelAutoReact = require('../utils/userChannelAutoReact');

async function chautoreactCommand(sock, from, msg, args = [], isOwner = false, isSessionOwner = false) {
  return await userChannelAutoReact.chautoreactCommand(sock, from, msg, args, isOwner, isSessionOwner);
}

module.exports = {
  chautoreactCommand
};
