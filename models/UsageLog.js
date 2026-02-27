module.exports = (sequelize, DataTypes) => {
  return sequelize.define('UsageLog', {
    connectionId: DataTypes.STRING,
    tokensUsed: DataTypes.INTEGER,
    cost: DataTypes.FLOAT,
    latency: DataTypes.FLOAT
  });
};
