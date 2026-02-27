const Connection = require('./Connection');
const ConnectionKnowledge = require('./ConnectionKnowledge');
const ChatSession = require('./ChatSession');
const MissedQuestion = require('./MissedQuestion');
const PendingExtraction = require('./PendingExtraction');
const ConfidencePolicy = require('./ConfidencePolicy');
const ConnectionDiscovery = require('./ConnectionDiscovery');
const ConnectionCrawlSession = require('./ConnectionCrawlSession');
const ManualUpload = require('./ManualUpload');
const PageContent = require('./PageContent');
const User = require('./User');
const ButtonSet = require('./ButtonSet');
const BehaviorDocument = require('./BehaviorDocument');
const BehaviorSuggestion = require('./BehaviorSuggestion');

// --- Associations ---

// Connection <-> ConnectionKnowledge
Connection.hasMany(ConnectionKnowledge, { foreignKey: 'connectionId', sourceKey: 'connectionId' });
ConnectionKnowledge.belongsTo(Connection, { foreignKey: 'connectionId', targetKey: 'connectionId' });

// Connection <-> ChatSession
Connection.hasMany(ChatSession, { foreignKey: 'connectionId', sourceKey: 'connectionId' });
ChatSession.belongsTo(Connection, { foreignKey: 'connectionId', targetKey: 'connectionId' });

// Connection <-> PendingExtraction
Connection.hasMany(PendingExtraction, { foreignKey: 'connectionId', sourceKey: 'connectionId' });
PendingExtraction.belongsTo(Connection, { foreignKey: 'connectionId', targetKey: 'connectionId' });

// Connection <-> MissedQuestion
Connection.hasMany(MissedQuestion, { foreignKey: 'connectionId', sourceKey: 'connectionId' });
MissedQuestion.belongsTo(Connection, { foreignKey: 'connectionId', targetKey: 'connectionId' });

// Connection <-> ConfidencePolicy
Connection.hasOne(ConfidencePolicy, { foreignKey: 'connectionId', sourceKey: 'connectionId' });
ConfidencePolicy.belongsTo(Connection, { foreignKey: 'connectionId', targetKey: 'connectionId' });

// Connection <-> ButtonSet
Connection.hasMany(ButtonSet, { foreignKey: 'connectionId', sourceKey: 'connectionId' });
ButtonSet.belongsTo(Connection, { foreignKey: 'connectionId', targetKey: 'connectionId' });

// Connection <-> BehaviorDocument
Connection.hasMany(BehaviorDocument, { foreignKey: 'connectionId', sourceKey: 'connectionId' });
BehaviorDocument.belongsTo(Connection, { foreignKey: 'connectionId', targetKey: 'connectionId' });

// Connection <-> BehaviorSuggestion
Connection.hasMany(BehaviorSuggestion, { foreignKey: 'connectionId', sourceKey: 'connectionId' });
BehaviorSuggestion.belongsTo(Connection, { foreignKey: 'connectionId', targetKey: 'connectionId' });

// BehaviorDocument <-> BehaviorSuggestion
BehaviorDocument.hasMany(BehaviorSuggestion, { foreignKey: 'documentId', sourceKey: 'id' });
BehaviorSuggestion.belongsTo(BehaviorDocument, { foreignKey: 'documentId', targetKey: 'id' });

module.exports = {
    Connection,
    ConnectionKnowledge,
    ChatSession,
    MissedQuestion,
    PendingExtraction,
    ConfidencePolicy,
    ConnectionDiscovery,
    ConnectionCrawlSession,
    ManualUpload,
    PageContent,
    User,
    ButtonSet,
    BehaviorDocument,
    BehaviorSuggestion
};
