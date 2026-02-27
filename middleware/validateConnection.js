const Connection = require("../models/Connection");

module.exports = async (req, res, next) => {
  try {
    // Flexible extraction
    const connectionId =
      req.params.connectionId ||
      req.body.connectionId ||
      req.headers["x-connection-id"];

    if (!connectionId) {
      return res.status(400).json({
        error: "CONNECTION_ID_REQUIRED"
      });
    }

    const connection = await Connection.findOne({
      where: { connectionId }
    });

    if (!connection) {
      return res.status(404).json({
        error: "INVALID_CONNECTION_ID"
      });
    }

    // Attach once
    req.connection = connection;

    next();
  } catch (error) {
    console.error("validateConnection middleware error:", error);
    return res.status(500).json({
      error: "CONNECTION_VALIDATION_FAILED"
    });
  }
};
