import type { UUID, Character } from "@elizaos/core";
import { CognitoIdentityProviderClient, InitiateAuthCommand } from "@aws-sdk/client-cognito-identity-provider";

const BASE_URL =
    import.meta.env.VITE_SERVER_BASE_URL ||
    `${import.meta.env.VITE_SERVER_URL}:${import.meta.env.VITE_SERVER_PORT}`;

const clientId = import.meta.env.VITE_AWS_COGNITO_CLIENT_ID;
const userPoolId = import.meta.env.VITE_AWS_COGNITO_USER_POOL_ID;
const region = import.meta.env.VITE_AWS_COGNITO_REGION;

console.log({ BASE_URL });

const getJwtToken = async () => {
    if (!clientId) // Using clientId as flag to use JWT
        return

    let token = localStorage.getItem("jwtToken");
    const tokenExp = localStorage.getItem("jwtTokenExp");

    if (!token || token != '' ||  !tokenExp || Date.now() > parseInt(tokenExp)) {
        const email    = import.meta.env.VITE_AWS_COGNITO_EMAIL;
        const password = import.meta.env.VITE_AWS_COGNITO_PASSWORD;
        const client   = new CognitoIdentityProviderClient({ region });

        try {
            const response = await client.send(new InitiateAuthCommand({
                AuthFlow: "USER_PASSWORD_AUTH",
                ClientId: clientId,
                // @ts-ignore
                UserPoolId: userPoolId,
                AuthParameters: {
                    USERNAME: email!,
                    PASSWORD: password!,
                },
            }))

            if (response.AuthenticationResult?.AccessToken) {
                token = response.AuthenticationResult!.AccessToken!
                localStorage.setItem("jwtToken", token || '');
                localStorage.setItem(
                    "jwtTokenExp",
                    (Date.now() + response.AuthenticationResult!.ExpiresIn! * 1000).toString()
                );
            } else {
                console.log("No AccessToken for user: ", response)
            }
        } catch (e) {
            console.error("Error getting JWT: ", e);
        }
    }

    return token ? `Bearer ${token}` : "";
}

const fetcher = async ({
    url,
    method,
    body,
    headers,
}: {
    url: string;
    method?: "GET" | "POST";
    body?: object | FormData;
    headers?: HeadersInit;
}) => {
    const options: RequestInit = {
        method: method ?? "GET",
        headers: headers
            ? headers
            : {
                  Accept: "application/json",
                  "Content-Type": "application/json",
              },
    };

    if (method === "POST") {
        // @ts-ignore
        options.headers["Authorization"] = await getJwtToken();

        if (body instanceof FormData) {
            if (options.headers && typeof options.headers === "object") {
                // Create new headers object without Content-Type
                options.headers = Object.fromEntries(
                    Object.entries(
                        options.headers as Record<string, string>
                    ).filter(([key]) => key !== "Content-Type")
                );
            }
            options.body = body;
        } else {
            options.body = JSON.stringify(body);
        }
    }

    return fetch(`${BASE_URL}${url}`, options).then(async (resp) => {
        const contentType = resp.headers.get("Content-Type");
        if (contentType === "audio/mpeg") {
            return await resp.blob();
        }

        if (!resp.ok) {
            const errorText = await resp.text();
            console.error("Error: ", errorText);

            let errorMessage = "An error occurred.";
            try {
                const errorObj = JSON.parse(errorText);
                errorMessage = errorObj.message || errorMessage;
            } catch {
                errorMessage = errorText || errorMessage;
            }

            throw new Error(errorMessage);
        }

        return resp.json();
    });
};

export const apiClient = {
    sendMessage: (
        agentId: string,
        message: string,
        selectedFile?: File | null
    ) => {
        const formData = new FormData();
        formData.append("text", message);
        // formData.append("user", "user");

        if (selectedFile) {
            formData.append("file", selectedFile);
        }
        return fetcher({
            url: `/${agentId}/message`,
            method: "POST",
            body: formData,
        });
    },
    getAgents: () => fetcher({ url: "/agents" }),
    getAgent: (agentId: string): Promise<{ id: UUID; character: Character }> =>
        fetcher({ url: `/agents/${agentId}` }),
    tts: (agentId: string, text: string) =>
        fetcher({
            url: `/${agentId}/tts`,
            method: "POST",
            body: {
                text,
            },
            headers: {
                "Content-Type": "application/json",
                Accept: "audio/mpeg",
                "Transfer-Encoding": "chunked",
            },
        }),
    whisper: async (agentId: string, audioBlob: Blob) => {
        const formData = new FormData();
        formData.append("file", audioBlob, "recording.wav");
        return fetcher({
            url: `/${agentId}/whisper`,
            method: "POST",
            body: formData,
        });
    },
};
