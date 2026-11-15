'use strict';

/**
 * Command: .chautoreact / .autoreactch / .afreact
 * User Followed Channels Auto-Reaction Control & Management
 */

const userChannelAutoReact = require('../utils/userChannelAutoReact');

async function chautoreactCommand(sock, from, msg, args = [], isOwner = false, isMasterOwner = false, isSessionOwner = false, sessions = {}) {
  return await userChannelAutoReact.chautoreactCommand(sock, from, msg, args, isOwner, isMasterOwner, isSessionOwner, sessions);
}

module.exports = {
  chautoreactCommand
};
