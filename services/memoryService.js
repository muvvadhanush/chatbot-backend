const { ChatSession } = require('../models');

async function updateMemory(sessionId, key, value) {
  const session = await ChatSession.findByPk(sessionId);
  const memory = session.memory || {};
  memory[key] = value;
  session.memory = memory;
  await session.save();
}

async function getMemory(sessionId) {
  const session = await ChatSession.findByPk(sessionId);
  return session.memory || {};
}

module.exports = { updateMemory, getMemory };
