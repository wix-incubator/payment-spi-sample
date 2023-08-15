/****************************************************** 
 *                  JWT Validation                    *
 * This file includes code to validate the JSON web   *
 * tokens that are included with requests sent to the * 
 * server from Wix.                                   *
 ******************************************************/

import { createRequire } from "module";
const require = createRequire(import.meta.url);
// Import the jsonwebtoken NPM package. 
// Learn more: https://www.npmjs.com/package/jsonwebtoken
const jwt = require('jsonwebtoken');
// Import the native Node.js crytpo package.
// Learn more: https://nodejs.org/api/crypto.html
const crypto = require('crypto');

// Grab the app's public key. 
// Find your app's key in the Wix Dev Center: https://dev.wix.com
const appKey = process.env['WIX_APP_PUBLIC_KEY']

export function jwtProcessing (token, requestBody) {
  // Remove the "JWT=" prefix from the beginning of the header.
  token = token.replace("JWT=", '');
  let tokenBody;
  // Verify the token's encryption.
  try {
    tokenBody = verifyToken(token);
  } catch (error) {
    return error;
  }
  // Verify that the token hasn't expired.
  if( Date.now()/1000 > tokenBody.exp){
    throw new Error()
  }
  // Verify that the token's data payload is the same as the request body.
  return verifyMessageBody(tokenBody, requestBody);
}

// This function verifies a token's encryption using the 
// jsonwebtoken package's built-in 'verify' function.
function verifyToken (token) {
  try {
    let tokenBody = jwt.verify(token, appKey, {algorithms: ['RS256']});
    return tokenBody;
  } catch (error){
    return error;
  }
}

// This function encodes the request body using SHA256 and
// compares to token's "data" claim.
function verifyMessageBody (tokenBody, requestBody){
  // Encode
  const hash = crypto.createHash('sha256').update(requestBody).digest('hex');
  // Compare
  if(hash === tokenBody.data.SHA256){
    return true;
  } else {
    return false;
  }
}
