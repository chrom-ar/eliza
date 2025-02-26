import {
    CacheManager,
    MemoryCacheAdapter,
    ModelProviderName,
    AgentRuntime,
    IAgentRuntime,
} from '@elizaos/core';

import { SqliteDatabaseAdapter, loadVecExtensions } from "@elizaos-plugins/adapter-sqlite";
import Sqlite3 from "better-sqlite3";

export const createRuntime = async (): Promise<IAgentRuntime> => {
    const adapter = new SqliteDatabaseAdapter(new Sqlite3("/tmp/eliza-test.db"));

    // Load sqlite-vss
    await loadVecExtensions((adapter as SqliteDatabaseAdapter).db);

    await adapter.init()

    const mockRuntime: IAgentRuntime = new AgentRuntime({
        serverUrl: "http://localhost:7998",
        token: 'testing',
        conversationLength: 32,
        modelProvider: ModelProviderName.OLLAMA,
        databaseAdapter: adapter,
        actions: [],
        evaluators: [],
        providers: [],
        cacheManager: new CacheManager(new MemoryCacheAdapter()),
        character: {
            name: "TestCharacter",
            modelProvider: ModelProviderName.OLLAMA,
            bio: "Test character for unit tests",
            lore: [],
            messageExamples: [],
            postExamples: [],
            topics: [],
            adjectives: [],
            plugins: [],
            style: {
                all: [],
                chat: [],
                post: [],
            },
        },
    });

    await mockRuntime.initialize()

    return mockRuntime
}
