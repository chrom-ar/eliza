/*
This is a CLI for AWS Cognito user management.
It allows you to create a new user account and get an access token for an existing user.

npm install @aws-sdk/client-cognito-identity-provider


Set the following environment variables:
AWS_COGNITO_EMAIL // your email
AWS_COGNITO_PASSWORD // your password
AWS_COGNITO_CLIENT_ID // Protocol client_id
AWS_COGNITO_USER_POOL_ID // Protocol user_pool_id
AWS_COGNITO_REGION // Protocol region

Run with:
npx tsx scripts/client-jwt-aws.ts create-account
npx tsx scripts/client-jwt-aws.ts get-token
*/
import { CognitoIdentityProviderClient, InitiateAuthCommand, SignUpCommand, ConfirmSignUpCommand } from "@aws-sdk/client-cognito-identity-provider";
import * as readline from 'readline/promises';
import { Command } from 'commander';

const program = new Command();

// Initialize environment variables and client
const email = process.env.AWS_COGNITO_EMAIL;
const password = process.env.AWS_COGNITO_PASSWORD;
// Protol data:
const clientId = process.env.AWS_COGNITO_CLIENT_ID;
const userPoolId = process.env.AWS_COGNITO_USER_POOL_ID;
const region = process.env.AWS_COGNITO_REGION;

const client = new CognitoIdentityProviderClient({ region });
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});



async function signUp() {
    return await client.send(
        new SignUpCommand({
            ClientId: clientId,
            Username: email,
            Password: password,
            UserPoolId: userPoolId,
            UserAttributes: [
                {
                    Name: "email",
                    Value: email,
                },
            ],
        })
    );
}

async function confirmSignUp(confirmationCode: string) {
    return await client.send(
        new ConfirmSignUpCommand({
            ClientId: clientId,
            ConfirmationCode: confirmationCode,
            Username: email!,
            UserPoolId: userPoolId,
        })
    );
}

async function initiateAuth() {
    return await client.send(new InitiateAuthCommand({
        AuthFlow: "USER_PASSWORD_AUTH",
        ClientId: clientId,
        UserPoolId: userPoolId,
        AuthParameters: {
            USERNAME: email!,
            PASSWORD: password!,
        },
    }));
}

// Configure CLI commands
program
  .name('cognito-cli')
  .description('CLI for AWS Cognito user management')
  .version('1.0.0');

program.command('create-account')
  .description('Create and confirm a new user account')
  .action(async () => {
    try {
      const signUpResponse = await signUp();
      if (signUpResponse['$metadata'].httpStatusCode === 200) {
        console.log('Sign-up successful. Check your email for the confirmation code.');
      } else {
        console.error('Sign-up failed:', signUpResponse);
        return;
      }
      const confirmationCode = await rl.question('Enter the confirmation code: ');
      const confirmSignUpResponse = await confirmSignUp(confirmationCode);
      if (confirmSignUpResponse['$metadata'].httpStatusCode === 200) {
        console.log('Account confirmed successfully!');
      } else {
        console.error('Account confirmation failed:', confirmSignUpResponse);
        return;
      }
    } catch (error) {
      console.error('Account creation failed:', error);
    } finally {
      rl.close();
    }
  });

program.command('get-token')
  .description('Get an access token for an existing user')
  .action(async () => {
    try {
      const authResponse = await initiateAuth();
      console.log('Access Token:', authResponse.AuthenticationResult?.AccessToken);
      console.log('Expires In:', authResponse.AuthenticationResult?.ExpiresIn, 'seconds');
    } catch (error) {
      console.error('Authentication failed:', error);
    } finally {
      rl.close();
    }
  });

program.parseAsync(process.argv);
