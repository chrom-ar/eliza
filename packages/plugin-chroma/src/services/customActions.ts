import fs from 'fs';
import { Service, ServiceType, IAgentRuntime, elizaLogger} from '@elizaos/core';

export class CustomActionsService extends Service {
  private initialized = false;
  private runtime: IAgentRuntime;

  constructor() {
    super();
  }

  static get serviceType(): ServiceType {
    return "CustomActions" as ServiceType
  }

  async initialize(runtime: IAgentRuntime): Promise<void> {
    if (this.initialized) {
      return
    }

    this.runtime = runtime;

    elizaLogger.info('[CustomActionsService] initialized');

    this.initialized = true;

    // import.meta.url returns the dist/xx path, we want the plugin root
    // @ts-ignore
    const dir = new URL(`../custom_actions/${this.runtime.agentId}`, import.meta.url);
    console.log("[CustomActionsService] dir: ", dir.pathname);

    try {
      fs.readdirSync(dir.pathname).forEach(file => {
        import(dir.pathname + "/" + file).then(action => {
          this.runtime.registerAction(action.default)
        }).catch(error => {
          console.error("Error: ", error)
        })
      })
    } catch (error) {
      console.error("Error: ", error)
    }

    elizaLogger.info('[CustomActionsService] actions registered');
  }
}
