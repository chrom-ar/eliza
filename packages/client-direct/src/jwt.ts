

const jwt = require('jsonwebtoken');
const jwkToPem = require('jwk-to-pem'); // Convert JWK to PEM format

const REGION = process.env.AWS_COGNITO_REGION;
const USER_POOL_ID = process.env.AWS_COGNITO_USER_POOL_ID;
const APP_CLIENT_ID = process.env.AWS_COGNITO_CLIENT_ID;

export async function validateJWT(req, res, next) {
    return handleJWT(req, res, next, true);
}

export async function tryJWTWithoutError(req, res, next) {
    return handleJWT(req, res, next, false);
}

async function handleJWT(req, res, next, raiseError = true) {
    let token;
    
    if (req.headers.authorization) {
        token = req.headers.authorization.split(' ')[1]; // Get token from Authorization header (Bearer <token>)
    } else if (req.params.jwtToken) {
        token = req.params.jwtToken; // Get token from query parameter
    }

    console.log("JWT token", token);

    if (!token) {
        if (raiseError) {
            return res.status(401).json({ message: 'No token provided' });
        } else {
            return next();
        }
    }

    try {
        const decodedHeader = jwt.decode(token, { complete: true }).header;
        if (!decodedHeader || !decodedHeader.kid) {
            return res.status(401).json({ message: 'Invalid token header' });
        }

        console.log("Decoded header", decodedHeader);

        // 1. Fetch JWKS from Cognito
        const jwksUrl = `https://cognito-idp.${REGION}.amazonaws.com/${USER_POOL_ID}/.well-known/jwks.json`;
        const response = await fetch(jwksUrl);
        const jwks = await response.json();

        console.log("JWKS", jwks);

        // 2. Find the signing key (JWK) based on 'kid' in the token header
        const signingKey = jwks.keys.find(key => key.kid === decodedHeader.kid);
        if (!signingKey) {
            return res.status(401).json({ message: 'No matching signing key found' });
        }

        // 3. Convert JWK to PEM format (required by jsonwebtoken)
        const pem = jwkToPem(signingKey);

        // 4. Verify the JWT
        jwt.verify(token, pem, { algorithms: ['RS256'] }, (err, decodedToken) => {
            // Invalid signature or expired token
            if (err) {
                console.error('JWT Verification Error:', err);
                return res.status(401).json({ message: 'Invalid token: ' + err.message });
            }

            // 5. Validate Token Claims (Issuer, Audience, Expiration, Token Use)
            const issuer = `https://cognito-idp.${REGION}.amazonaws.com/${USER_POOL_ID}`;
            const audience = APP_CLIENT_ID; // Your App Client ID

            if (decodedToken.iss !== issuer) {
                return res.status(401).json({ message: 'Invalid issuer' });
            }
            if (decodedToken.aud !== audience) {
                return res.status(401).json({ message: 'Invalid audience' });
            }
            if (decodedToken.token_use !== 'access') { // Expecting Access Token for API access
                return res.status(401).json({ message: 'Invalid token use (expecting access token)' });
            }

            // Token is valid! Attach user info to the request (optional)
            req.jwtUserId = decodedToken.sub;
            console.log('JWT Validated:', decodedToken);
            next(); // Proceed to the next middleware/route handler
        });


    } catch (error) {
        console.error('JWT Validation Error:', error);
        return res.status(401).json({ message: 'Invalid token' });
    }
}