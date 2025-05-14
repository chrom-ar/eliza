const BASE_URL = 'http://localhost:3000/chroma/message';
const ROOM_ID = 'test-room';
const USER_ID = 'test-user';

// List of all parse actions from the Chroma plugin
const PARSE_ACTIONS = [
    'PARSE_TRANSFER_INTENT',
    'PARSE_SWAP_INTENT',
    'PARSE_BRIDGE_INTENT',
    'PARSE_YIELD_INTENT',
    'PARSE_CONFIDENTIAL_DEPOSIT_INTENT',
] as const;

type ParseAction = typeof PARSE_ACTIONS[number];

// Helper function to make POST requests
async function postMessage(action: string, text: string) {
    try {
        const response = await fetch(BASE_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                action,
                text,
                roomId: ROOM_ID,
                userId: USER_ID
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        if (error instanceof Error) {
            console.error(`Error testing ${action}:`, error.message);
        } else {
            console.error(`Error testing ${action}:`, 'Unknown error occurred');
        }
        return null;
    }
}

// Test messages for each action type
const TEST_MESSAGES: Record<ParseAction, string> = {
    PARSE_TRANSFER_INTENT: "I want to transfer 0.1 USDC to 0x640bb21185093058549dFB000D566358dc40C584",
    PARSE_SWAP_INTENT: "For this intent I want to use Ethereum mainnet, I want to swap 0.1 USDC for ETH",
    PARSE_BRIDGE_INTENT: "Bridge 0.001 ETH to Ethereum mainnet",
    PARSE_YIELD_INTENT: "Yield 0.1 USDC",
    PARSE_CONFIDENTIAL_DEPOSIT_INTENT: "Make a private deposit in ethereum mainnet",
};

// Main test function
async function runTests() {
    console.log('Starting integration tests...');
    await postMessage('CREATE_WALLET', 'CREATE_WALLET'); // just in case
    
    for (const action of PARSE_ACTIONS) {
        console.log(`\nTesting ${action}...`);
        const testMessage = TEST_MESSAGES[action];
        const response = await postMessage(action, testMessage);
        console.log(`Response for ${action}:`, response);

        if (response) {
            const confirmResponse = await postMessage('CONFIRM_INTENT', 'CONFIRM_INTENT');
            console.log('Confirmation response:', confirmResponse);
        }
    }
    
    console.log('\nAll tests completed!');
}

// Run the tests
runTests().catch(console.error); 