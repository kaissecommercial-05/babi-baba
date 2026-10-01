const { onRequest } = require("firebase-functions/https");
const { setGlobalOptions } = require("firebase-functions");

setGlobalOptions({
  maxInstances: 10
});

exports.imageKitAuth = onRequest(
  {
    cors: true
  },
  async (req, res) => {
    res.status(200).json({
      message: "ImageKit Auth fonctionne"
    });
  }
);