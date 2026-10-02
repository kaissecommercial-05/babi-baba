import crypto from "crypto";

export const handler = async () => {
  try {
    const privateKey = process.env.IMAGEKIT_PRIVATE_KEY;

    if (!privateKey) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: "IMAGEKIT_PRIVATE_KEY est introuvable"
        })
      };
    }

    const token = crypto.randomUUID();
    const expire = Math.floor(Date.now() / 1000) + 1800;

    const signature = crypto
      .createHmac("sha1", privateKey)
      .update(token + expire)
      .digest("hex");

    return {
      statusCode: 200,
      body: JSON.stringify({
        token,
        expire,
        signature
      })
    };
  } catch (error) {
    console.error(error);

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Impossible de générer l'authentification ImageKit"
      })
    };
  }
};
