import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { bytesToUtf8 } from '@waku/sdk';
import {
  INTENTS_TOPIC,
  sendMsg,
  subscribeTo,
  startNode,
  randomTopic,
} from './common';

import { SwapIntent } from '../types';

const verifySignature = (body, signature, publicKey) => {
  try {
    const bodyBytes = new TextEncoder().encode(JSON.stringify(body));
    const signatureBytes = bs58.decode(bytesToUtf8(signature));
    const publicKeyBytes = bs58.decode(bytesToUtf8(publicKey));

    return nacl.sign.detached.verify(bodyBytes, signatureBytes, publicKeyBytes);
  } catch (e) {
    console.error('Error verifying signature:', e);
    return false;
  }
};

export const sendIntent = async (intent: SwapIntent) => {
  const node = await startNode();
  const privTopic = randomTopic();

  return new Promise(async (resolve, reject) => {
    // Set up subscription to handle responses
    await subscribeTo(node, privTopic, async (node, topic, msg) => {
      switch (msg.state) {
        case 'IntentProposal':
          if (verifySignature(msg.body, msg.signedBody, msg.pubKey)) {
            console.log('Signature verified, proceeding...');
            resolve(msg.body); // Resolve with the proposal data
          } else {
            console.error('Signature verification failed, aborting...');
            reject(new Error('Signature verification failed'));
          }
          break;
        case 'Error':
          console.log('TX error', msg.body);
          reject(new Error(msg.body)); // Reject with error message
          break;
        default:
          console.log('[handshake] unknown state: ', msg.state);
          reject(new Error(`Unknown state: ${msg.state}`));
          break;
      }
    }).catch(reject);

    await sendMsg({
      node,
      topic: INTENTS_TOPIC,
      replyTo: privTopic,
      state: 'Intent',
      body: [JSON.stringify(intent)]
    }).catch(reject);
  });
};
